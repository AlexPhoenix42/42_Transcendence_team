/**
 * LobbyClient - the pre-game room over the same `ws/game/<room>/` socket.
 *
 * Everyone in a room announces `{ name, role, ready }` with `lobby_hello`; the
 * client keeps a roster keyed by player id (own id learnt from the first
 * `player_joined`). When someone sends `lobby_start`, every client counts down
 * and then loads the game.
 *
 * Events (via {@link LobbyClient#on}):
 * - `roster` (Array<{id, name, role, ready, self}>)  the room changed
 * - `start`  (seconds)                               countdown began
 * - `error`  (message)
 *
 * @class LobbyClient
 */
class LobbyClient {
    /**
     * @param {Object} options
     * @param {string} options.room - Room name.
     * @param {string} [options.url] - WebSocket origin, defaults to host:8000.
     */
    constructor(options) {
        this.room = options.room;
        this.url = options.url || `ws://${window.location.hostname}:8000`;

        this.ws = null;
        this.selfId = null;
        this.me = { name : '', role : 'pacman', ready : false };
        /** @type {Map<string, {name, role, ready}>} */
        this.roster = new Map();

        this._handlers = {};
        this._helloTimer = null;
    }

    /**
     * @param {string} event
     * @param {Function} listener
     * @returns {LobbyClient} this
     */
    on(event, listener) {
        if (!this._handlers[event]) this._handlers[event] = [];
        this._handlers[event].push(listener);
        return this;
    }

    /**
     * @private
     */
    _emit(event, ...args) {
        (this._handlers[event] || []).slice().forEach(fn => {
            try {
                fn(...args);
            } catch (e) {
                if (event !== 'error') this._emit('error', e && e.message);
            }
        });
    }

    /**
     * Open the socket and start announcing ourselves.
     */
    connect() {
        try {
            this.ws = new WebSocket(`${this.url}/ws/game/${encodeURIComponent(this.room)}/`);
        } catch (e) {
            this._emit('error', `connexion impossible : ${e && e.message}`);
            return;
        }

        this.ws.onopen = () => {
            this._hello();
            // Re-announce every 2s so anyone who joined after us learns our state.
            this._helloTimer = window.setInterval(() => this._hello(), 2000);
        };

        this.ws.onclose = () => {
            if (this._helloTimer) window.clearInterval(this._helloTimer);
        };

        this.ws.onerror = () => this._emit('error', 'erreur socket');

        this.ws.onmessage = event => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch (e) {
                this._emit('error', `message illisible : ${e && e.message}`);
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
                if (!this.selfId) {
                    this.selfId = msg.player_id;
                } else {
                    this._hello(); // greet the newcomer
                }
                break;
            case 'player_left':
                if (this.roster.delete(msg.player_id)) this._emitRoster();
                break;
            case 'lobby_hello':
                if (msg.player_id === this.selfId) break;
                this.roster.set(msg.player_id, {
                    name : String(msg.name || 'Joueur').slice(0, 20),
                    role : msg.role || 'pacman',
                    ready : !!msg.ready
                });
                this._emitRoster();
                break;
            case 'lobby_start':
                this._emit('start', typeof msg.countdown === 'number' ? msg.countdown : 3);
                break;
            default:
                break;
        }
    }

    /**
     * @private
     */
    _emitRoster() {
        const list = [{
            id : this.selfId || 'me',
            name : this.me.name || 'Moi',
            role : this.me.role,
            ready : this.me.ready,
            self : true
        }];
        this.roster.forEach((p, id) => list.push({ id : id, name : p.name, role : p.role, ready : p.ready, self : false }));
        this._emit('roster', list);
    }

    /**
     * @private
     */
    _send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(obj));
            } catch (e) {
                this._emit('error', `envoi impossible : ${e && e.message}`);
            }
        }
    }

    /**
     * @private
     */
    _hello() {
        this._send({
            type : 'lobby_hello',
            name : this.me.name,
            role : this.me.role,
            ready : this.me.ready
        });
    }

    /**
     * @param {string} name
     */
    setName(name) {
        this.me.name = String(name || '').slice(0, 20);
        this._hello();
        this._emitRoster();
    }

    /**
     * @param {string} role - `pacman` | `madame_pacman` | `ghost` | `builder`.
     */
    setRole(role) {
        this.me.role = role;
        this._hello();
        this._emitRoster();
    }

    /**
     * @param {boolean} ready
     */
    setReady(ready) {
        this.me.ready = !!ready;
        this._hello();
        this._emitRoster();
    }

    /**
     * Ask the room to start (only meaningful once everyone is ready).
     * @param {number} [countdown=3]
     */
    start(countdown) {
        this._send({ type : 'lobby_start', countdown : countdown || 3 });
    }

    /**
     * Close the socket.
     */
    disconnect() {
        if (this._helloTimer) window.clearInterval(this._helloTimer);
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }
    }
}

export default LobbyClient;
