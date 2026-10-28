/**
 * NetClient - thin WebSocket transport for the multiplayer game.
 *
 * It only moves messages: it does not know about Pac-Man, sprites or the game
 * loop. Consumers subscribe with {@link NetClient#on} and get four events:
 *
 * - `open`  ()                         socket is connected
 * - `close` ()                         socket dropped (a reconnect is scheduled)
 * - `self`  (playerId)                 the server telling us our own id (always first)
 * - `join`  (playerId)                 someone else joined the room
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
import { refreshAccessToken } from "../../api/client.ts";

export interface NetClientOptions {
    /** Room name (alphanumeric, `-` and `_`). */
    room: string;
    /** WebSocket origin, e.g. `ws://localhost:8000`. Defaults to the current host. */
    url?: string;
}

type Handler = (...args: any[]) => void;

class NetClient {
    room: string;
    url: string;
    ws: WebSocket | null = null;
    connected = false;
    lastError: string | null = null;

    _handlers: Record<string, Handler[]> = {};
    _reconnects = 0;
    _maxReconnects = 5;
    _reconnectDelay = 2000;

    _lastSent = 0;
    _minSendInterval = 50; // ms

    /**
     * @param options
     */
    constructor(options: NetClientOptions) {
        this.room = options.room;
        this.url = options.url || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

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
     * @param event - `open` | `close` | `join` | `leave` | `pos` | `role` | `wall` | `walldestroy` | `roundover` | `roundrestart` | `roundstarted` | `doteaten` | `sync` | `caught` | `ghosthome` | `imprisoned` | `power` | `error`.
     * @param listener
     * @returns this
     */
    on(event: string, listener: Handler): this {
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(listener);
        return this;
    }

    /**
     * Announce our role to the room.
     * @param role - `pacman` | `madame_pacman` | `baby` | `blocker` | `builder` | `ghost`.
     * @param metadata
     */
    sendRole(role: string, metadata?: Record<string, unknown>): void {
        this._send({ type: "role_assignment", role: role, metadata: metadata || {} });
    }

    /**
     * Announce a temporary wall the Builder or Blocker just dropped.
     * @param col - Map column.
     * @param row - Map row.
     * @param ttl - Lifetime in seconds.
     * @param kind - `builder` (blocks Pac-Man) | `blocker` (blocks ghosts).
     */
    sendWall(col: number, row: number, ttl: number, kind?: string): void {
        this._send({ type: "wall_placed", tile: { col: col, row: row }, ttl: ttl, kind: kind || "builder" });
    }

    /**
     * Announce a wall the Blocker just destroyed (walked onto a Builder wall).
     * @param col - Map column.
     * @param row - Map row.
     */
    sendWallDestroy(col: number, row: number): void {
        this._send({ type: "wall_destroy", tile: { col: col, row: row } });
    }

    /**
     * Tell the server our game is running: the shared round switches to
     * `playing` and the server starts sending `state_sync`.
     */
    sendRoundStart(): void {
        this._send({ type: "round_start" });
    }

    /**
     * Report that our Pac-Man ate the dot at `(col, row)`. The server owns the
     * shared dot grid and the score; it echoes a `dot_eaten` if it accepts.
     * @param col
     * @param row
     */
    sendEatDot(col: number, row: number): void {
        this._send({ type: "eat_dot", col: col, row: row });
    }

    /**
     * Report that the ghost / Builder player `ghostId` touched our Pac-Man. The
     * server owns the outcome and echoes `player_caught` (a life lost) or, in a
     * power-pellet window, `ghost_home` (that ghost sent back to the house).
     * @param ghostId
     */
    sendContact(ghostId: string): void {
        this._send({ type: "contact", ghost: ghostId });
    }

    /**
     * Ask the server for a fresh full `state_sync` (debug / manual resync).
     */
    requestSync(): void {
        this._send({ type: "request_sync" });
    }

    /**
     * Ask the room to start a fresh round.
     */
    sendRoundRestart(): void {
        this._send({ type: "round_restart" });
    }

    /**
     * A ghost used a power (e.g. `freeze`) from a given spot; each client
     * applies it to whatever it hits nearby.
     * @param kind - `freeze`.
     * @param x
     * @param y
     */
    sendPower(kind: string, x: number, y: number): void {
        this._send({ type: "power_used", kind: kind, position: { x: x, y: y } });
    }

    /** We (Pac-Man / Ms Pac-Man) ate the fruit: make it vanish everywhere. */
    sendFruitEaten(): void {
        this._send({ type: "fruit_eaten" });
    }

    /**
     * Baby Pac-Man lifecycle, driven by the "papa" client.
     * @param kind
     * @param x
     * @param y
     */
    sendBaby(kind: "spawn" | "move" | "escape" | "died", x?: number, y?: number): void {
        this._send({ type: "baby_action", kind: kind, position: { x: x || 0, y: y || 0 } });
    }

    /**
     * @private
     */
    _emit(event: string, ...args: unknown[]): void {
        const list = this._handlers[event];
        if (!list) return;
        list.slice().forEach((fn) => {
            try {
                fn(...args);
            } catch (e) {
                this._fail(`listener for "${event}" threw: ${e && (e as Error).message}`);
            }
        });
    }

    /**
     * @private
     */
    _fail(message: string): void {
        this.lastError = message;
        const list = this._handlers.error;
        if (list) list.slice().forEach((fn) => fn(message));
    }

    /**
     * Open the socket.
     */
    async connect(): Promise<void> {
        // The access token is short-lived (a few minutes). A round can start
        // long after login (waiting in the lobby for another player, or just
        // idling) so the token carried over from page load/last API call can
        // already be expired by the time this actually opens the game
        // socket - the backend's JWT middleware then resolves an anonymous
        // user and closes with code 4001, which shows up in the browser as
        // "can't establish a connection" (bug report: exactly this, right
        // after a round start). Refresh right before connecting, same as
        // `api()` already does reactively on a 401 - here there's no request
        // to react to, so it's done proactively instead.
        await refreshAccessToken();

        let socket: WebSocket;
        try {
			socket = new WebSocket(
                `${this.url}/ws/pacman/${encodeURIComponent(this.room)}/`,
            );
        } catch (e) {
            this._fail(`connect failed: ${e && (e as Error).message}`);
            return;
        }

        this.ws = socket;

        socket.onopen = () => {
            this.connected = true;
            this._reconnects = 0;
            this._emit("open");
        };

        socket.onclose = () => {
            this.connected = false;
            this._emit("close");
            this._scheduleReconnect();
        };

        socket.onerror = () => this._fail("socket error");

        socket.onmessage = (event) => {
            let msg: any;
            try {
                msg = JSON.parse(event.data);
            } catch (e) {
                this._fail(`bad message: ${e && (e as Error).message}`);
                return;
            }
            this._route(msg);
        };
    }

    /**
     * @private
     */
    _route(msg: any): void {
        switch (msg.type) {
            case "self_id":
                this._emit("self", msg.player_id);
                break;
            case "player_joined":
                this._emit("join", msg.player_id);
                break;
            case "player_left":
                this._emit("leave", msg.player_id);
                break;
            case "position_update":
                this._emit("pos", msg.player_id, msg.position || {}, msg.direction || null);
                break;
            case "role_assignment":
                this._emit("role", msg.player_id, msg.role, msg.metadata || {});
                break;
            case "wall_placed": {
                const tile = msg.tile || {};
                this._emit("wall", msg.player_id, tile.col, tile.row, msg.ttl, msg.kind);
                break;
            }
            case "wall_destroy": {
                const tile = msg.tile || {};
                this._emit("walldestroy", tile.col, tile.row);
                break;
            }
            case "round_over":
                this._emit("roundover", msg.player_id, msg.winner);
                break;
            case "round_restart":
                this._emit("roundrestart", msg.player_id);
                break;
            case "round_started":
                this._emit("roundstarted", msg.level);
                break;
            case "dot_eaten":
                this._emit("doteaten", msg.col, msg.row, msg.by, msg.kind, msg.score);
                break;
            case "state_sync":
                this._emit("sync", msg);
                break;
            case "player_caught":
                this._emit("caught", msg.pid, msg.lives);
                break;
            case "ghost_home":
                this._emit("ghosthome", msg.ghost, msg.by);
                break;
            case "player_imprisoned":
                this._emit("imprisoned", msg.pid, msg.seconds);
                break;
            case "power_used": {
                const pos = msg.position || {};
                this._emit("power", msg.player_id, msg.kind, pos.x, pos.y);
                break;
            }
            case "fruit_eaten":
                this._emit("fruit", msg.player_id);
                break;
            case "baby_action": {
                const pos = msg.position || {};
                this._emit("baby", msg.player_id, msg.kind, pos.x, pos.y);
                break;
            }
            default:
                break;
        }
    }

    /**
     * @private
     */
    _scheduleReconnect(): void {
        if (this._reconnects >= this._maxReconnects) {
            this._fail("gave up reconnecting");
            return;
        }
        this._reconnects++;
        window.setTimeout(() => this.connect(), this._reconnectDelay);
    }

    /**
     * Send our position, throttled. No-op until the socket is open.
     * @param x
     * @param y
     * @param dir - `u` | `r` | `d` | `l`.
     */
    sendPosition(x: number, y: number, dir: string): void {
        const now = Date.now();
        if (now - this._lastSent < this._minSendInterval) return;
        this._lastSent = now;
        this._send({ type: "position_update", position: { x, y }, direction: dir });
    }

    /**
     * @private
     */
    _send(obj: unknown): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        try {
            this.ws.send(JSON.stringify(obj));
        } catch (e) {
            this._fail(`send failed: ${e && (e as Error).message}`);
        }
    }

    /**
     * Close for good (no reconnect).
     */
    disconnect(): void {
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
