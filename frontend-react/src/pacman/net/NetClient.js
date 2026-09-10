/**
 * NetClient - thin WebSocket transport for the multiplayer game.
 *
 * It only moves messages: it does not know about Pac-Man, sprites or the game
 * loop. Consumers subscribe with {@link NetClient#on} and get four events:
 *
 * - `open`  ()                         socket is connected
 * - `close` ()                         socket dropped (a reconnect is scheduled)
 * - `join`  (playerId)                 someone joined the room (ourselves first)
 * - `leave` (playerId)                 someone left
 * - `pos`   (playerId, {x, y}, dir)    a position update (includes our own echo)
 * - `role`  (playerId, role, meta)     a player announced its role
 * - `roundstarted` (level)             the shared round switched to `playing`
 * - `doteaten` (col, row, by, kind, score)  server accepted a dot being eaten
 * - `sync`  (snapshot)                 authoritative shared state (dots, scores)
 * - `caught` (pid, lives)              a ghost caught a Pac-Man (server verdict)
 * - `ghosthome` (ghostId, by)          a frightened contact sent a ghost home
 * - `imprisoned` (pid, seconds)        a Blocker was caught - imprisoned, not killed
 * - `walldestroy` (col, row)           a Blocker destroyed a wall
 * - `error` (message)                  something went wrong (no `console` here)
 *
 * Reconnects a few times with a fixed backoff. Outgoing position updates are
 * throttled so a 30fps loop doesn't flood the socket.
 *
 * @class NetClient
 */
import { getAccessToken } from '../../api/client.ts';

class NetClient {
    /**
     * @param {Object} options
     * @param {string} options.room - Room name (alphanumeric, `-` and `_`).
     * @param {string} [options.url] - WebSocket origin, e.g. `ws://localhost:8000`.
     *   Defaults to the current host on port 8000.
     */
    constructor(options) {
        this.room = options.room;
        this.url = options.url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

        this.ws = null;
        this.connected = false;
        this.lastError = null;

        this._handlers = {};
        this._reconnects = 0;
        this._maxReconnects = 5;
        this._reconnectDelay = 2000;

        this._lastSent = 0;
        this._minSendInterval = 50; // ms
    }

    /**
     * Subscribe to an event.
     * @param {string} event - `open` | `close` | `join` | `leave` | `pos` | `role` | `wall` | `walldestroy` | `roundover` | `roundrestart` | `roundstarted` | `doteaten` | `sync` | `caught` | `ghosthome` | `imprisoned` | `power` | `error`.
     * @param {Function} listener
     * @returns {NetClient} this
     */
    on(event, listener) {
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(listener);
        return this;
    }

    /**
     * Announce our role to the room.
     * @param {string} role - `pacman` | `madame_pacman` | `baby` | `blocker` | `builder` | `ghost`.
     * @param {Object} [metadata]
     */
    sendRole(role, metadata) {
        this._send({ type : 'role_assignment', role : role, metadata : metadata || {} });
    }

    /**
     * Announce a temporary wall the Builder or Blocker just dropped.
     * @param {number} col - Map column.
     * @param {number} row - Map row.
     * @param {number} ttl - Lifetime in seconds.
     * @param {string} [kind='builder'] - `builder` (blocks Pac-Man) | `blocker` (blocks ghosts).
     */
    sendWall(col, row, ttl, kind) {
        this._send({ type : 'wall_placed', tile : { col : col, row : row }, ttl : ttl, kind : kind || 'builder' });
    }

    /**
     * Announce a wall the Blocker just destroyed (walked onto a Builder wall).
     * @param {number} col - Map column.
     * @param {number} row - Map row.
     */
    sendWallDestroy(col, row) {
        this._send({ type : 'wall_destroy', tile : { col : col, row : row } });
    }

    /**
     * Tell the server our game is running: the shared round switches to
     * `playing` and the server starts sending `state_sync`.
     */
    sendRoundStart() {
        this._send({ type : 'round_start' });
    }

    /**
     * Report that our Pac-Man ate the dot at `(col, row)`. The server owns the
     * shared dot grid and the score; it echoes a `dot_eaten` if it accepts.
     * @param {number} col
     * @param {number} row
     */
    sendEatDot(col, row) {
        this._send({ type : 'eat_dot', col : col, row : row });
    }

    /**
     * Report that the ghost / Builder player `ghostId` touched our Pac-Man. The
     * server owns the outcome and echoes `player_caught` (a life lost) or, in a
     * power-pellet window, `ghost_home` (that ghost sent back to the house).
     * @param {string} ghostId
     */
    sendContact(ghostId) {
        this._send({ type : 'contact', ghost : ghostId });
    }

    /**
     * Ask the server for a fresh full `state_sync` (debug / manual resync).
     */
    requestSync() {
        this._send({ type : 'request_sync' });
    }

    /**
     * Ask the room to start a fresh round.
     */
    sendRoundRestart() {
        this._send({ type : 'round_restart' });
    }

    /**
     * A ghost used a power (e.g. `freeze`) from a given spot; each client
     * applies it to whatever it hits nearby.
     * @param {string} kind - `freeze`.
     * @param {number} x
     * @param {number} y
     */
    sendPower(kind, x, y) {
        this._send({ type : 'power_used', kind : kind, position : { x : x, y : y } });
    }

    /**
     * Baby Pac-Man lifecycle, driven by the "papa" client.
     * @param {'spawn'|'move'|'escape'} kind
     * @param {number} [x]
     * @param {number} [y]
     */
    sendBaby(kind, x, y) {
        this._send({ type : 'baby_action', kind : kind, position : { x : x || 0, y : y || 0 } });
    }

    /**
     * @private
     */
    _emit(event, ...args) {
        const list = this._handlers[event];
        if (!list) return;
        list.slice().forEach(fn => {
            try {
                fn(...args);
            } catch (e) {
                this._fail(`listener for "${event}" threw: ${e && e.message}`);
            }
        });
    }

    /**
     * @private
     */
    _fail(message) {
        this.lastError = message;
        const list = this._handlers.error;
        if (list) list.slice().forEach(fn => fn(message));
    }

    /**
     * Open the socket.
     */
    connect() {
        let socket;
        try {
            socket = new WebSocket(`${this.url}/ws/pacman/${encodeURIComponent(this.room)}/` + (getAccessToken() ? `?token=${encodeURIComponent(getAccessToken())}` : ''));
        } catch (e) {
            this._fail(`connect failed: ${e && e.message}`);
            return;
        }

        this.ws = socket;

        socket.onopen = () => {
            this.connected = true;
            this._reconnects = 0;
            this._emit('open');
        };

        socket.onclose = () => {
            this.connected = false;
            this._emit('close');
            this._scheduleReconnect();
        };

        socket.onerror = () => this._fail('socket error');

        socket.onmessage = event => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch (e) {
                this._fail(`bad message: ${e && e.message}`);
                return;
            }
            this._route(msg);
        };
    }

    /**
     * @private
     */
    _route(msg) {
        switch (msg.type) {
            case 'player_joined':
                this._emit('join', msg.player_id);
                break;
            case 'player_left':
                this._emit('leave', msg.player_id);
                break;
            case 'position_update':
                this._emit('pos', msg.player_id, msg.position || {}, msg.direction || null);
                break;
            case 'role_assignment':
                this._emit('role', msg.player_id, msg.role, msg.metadata || {});
                break;
            case 'wall_placed': {
                const tile = msg.tile || {};
                this._emit('wall', msg.player_id, tile.col, tile.row, msg.ttl, msg.kind);
                break;
            }
            case 'wall_destroy': {
                const tile = msg.tile || {};
                this._emit('walldestroy', tile.col, tile.row);
                break;
            }
            case 'round_over':
                this._emit('roundover', msg.player_id, msg.winner);
                break;
            case 'round_restart':
                this._emit('roundrestart', msg.player_id);
                break;
            case 'round_started':
                this._emit('roundstarted', msg.level);
                break;
            case 'dot_eaten':
                this._emit('doteaten', msg.col, msg.row, msg.by, msg.kind, msg.score);
                break;
            case 'state_sync':
                this._emit('sync', msg);
                break;
            case 'player_caught':
                this._emit('caught', msg.pid, msg.lives);
                break;
            case 'ghost_home':
                this._emit('ghosthome', msg.ghost, msg.by);
                break;
            case 'player_imprisoned':
                this._emit('imprisoned', msg.pid, msg.seconds);
                break;
            case 'power_used': {
                const pos = msg.position || {};
                this._emit('power', msg.player_id, msg.kind, pos.x, pos.y);
                break;
            }
            case 'baby_action': {
                const pos = msg.position || {};
                this._emit('baby', msg.player_id, msg.kind, pos.x, pos.y);
                break;
            }
            default:
                break;
        }
    }

    /**
     * @private
     */
    _scheduleReconnect() {
        if (this._reconnects >= this._maxReconnects) {
            this._fail('gave up reconnecting');
            return;
        }
        this._reconnects++;
        window.setTimeout(() => this.connect(), this._reconnectDelay);
    }

    /**
     * Send our position, throttled. No-op until the socket is open.
     * @param {number} x
     * @param {number} y
     * @param {string} dir - `u` | `r` | `d` | `l`.
     */
    sendPosition(x, y, dir) {
        const now = Date.now();
        if (now - this._lastSent < this._minSendInterval) return;
        this._lastSent = now;
        this._send({ type : 'position_update', position : { x, y }, direction : dir });
    }

    /**
     * @private
     */
    _send(obj) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        try {
            this.ws.send(JSON.stringify(obj));
        } catch (e) {
            this._fail(`send failed: ${e && e.message}`);
        }
    }

    /**
     * Close for good (no reconnect).
     */
    disconnect() {
        this._maxReconnects = 0;
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }
}

export default NetClient;
