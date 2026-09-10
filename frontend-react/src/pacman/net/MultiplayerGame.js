import JsPacman from '../Game.js';
import Character from '../Character.js';
import { STATE_RUNNING } from '../engine/Game.js';
import { STATUS_PLAY, STATUS_SPLASH } from '../GameModel.js';
import { KEY_UP, KEY_RIGHT, KEY_DOWN, KEY_LEFT } from '../engine/Keyboard.js';
import makeMsPacman from '../factory/makeMsPacman.js';
import makePacmanMan from '../factory/makePacmanMan.js';
import makePacmanBaby from '../factory/makePacmanBaby.js';
import makeGhost from '../factory/makeGhost.js';
import makeBuilder from '../factory/makeBuilder.js';
import makeDot from '../factory/makeDot.js';
import makePill from '../factory/makePill.js';
import NetClient from './NetClient.js';
import WallLayer, { BUILDER_WALL_CODE, BLOCKER_WALL_CODE } from './WallLayer.js';

/** No-op for the character constructor hooks a remote player never needs. */
const noop = () => {};

/** Space bar: Builder drops a wall, Ghost uses freeze. */
const KEY_ACTION = 32;

/** Seconds between two Builder walls, and how long a wall lasts. */
const WALL_COOLDOWN_MS = 3000;
const WALL_TTL_SECONDS = 10;

/** Ghost freeze power: reach, duration, cooldown. */
const FREEZE_RANGE_PX = 96;
const FREEZE_MS = 5000;
const FREEZE_COOLDOWN_MS = 6000;

/** Opposite direction lookup (a wall drops behind the Builder). */
const OPPOSITE_DIR = { l : 'r', r : 'l', u : 'd', d : 'u' };

/** Roles rendered as a Pac-Man (get a per-id colour tint). `blocker` is a
 * Pac-Man who can never die (imprisoned instead) and builds anti-ghost walls. */
const PACMAN_ROLES = ['pacman', 'madame_pacman', 'baby', 'blocker'];

/** Ghost sprite labels, picked by id hash so remote ghosts look varied. */
const GHOST_LABELS = ['pinky', 'blinky', 'inky', 'sue'];

/**
 * Accent visuel par rôle, IDENTIQUE sur tous les clients. Le sprite porte déjà
 * l'essentiel (Ms Pac-Man a son nœud, un fantôme est un fantôme…) ; on ne fait
 * que renforcer, et surtout on ne teinte PLUS par joueur - sinon le Pac-Man
 * adverse vire au vert/bleu chez l'autre et on « n'a pas la même vision ».
 * `blocker` = un Pac-Man constructeur : casque orange lumineux pour le
 * distinguer du Pac-Man classique (même sprite de base).
 */
const ROLE_LOOK = {
    pacman        : '',
    madame_pacman : 'drop-shadow(0 0 3px #ff6ec7)',
    baby          : 'brightness(1.2) saturate(1.5)',
    blocker       : 'hue-rotate(28deg) saturate(1.8) drop-shadow(0 0 4px #ff9a00)',
    ghost         : '',
    builder       : 'drop-shadow(0 0 4px #38d430)'
};

/** Halo blanc ajouté au perso local pour repérer « soi » d'un coup d'œil. */
const SELF_GLOW = 'drop-shadow(0 0 5px #fff) brightness(1.12)';

/**
 * MultiplayerGame - the normal jsPacman game plus the other players in the same
 * room. Each remote player is drawn with the sprite of its announced role
 * (Pac-Man / ghost / Builder / baby) and moved by interpolated network position.
 *
 * Nothing in `Game.js` is edited. `makeLevel` / `mainLoop` / `reset` /
 * `_getInputDirection` / `_onGhostEat*` are overridden, each calling `super`
 * and adding the multiplayer bits.
 *
 * - Pac-Man roles (`pacman` / `madame_pacman` / `baby` / `blocker`): you drive
 *   the base game's Pac-Man as usual. `blocker` is the odd one out: it never
 *   dies (imprisoned instead, see `_onPlayerImprisoned`), builds anti-ghost
 *   walls (`_maybeDropBlockerWall`), and can walk onto/destroy Builder walls
 *   (`_maybeDestroyWall`) that stop every other Pac-Man role.
 * - Ghost / Builder roles: the base Pac-Man is parked and hidden, and you drive
 *   a ghost/Builder avatar around the maze instead (`this.avatar`). Scoring /
 *   catching pacmen comes with the server-authoritative step.
 *
 * @class MultiplayerGame
 * @extends {JsPacman}
 */
class MultiplayerGame extends JsPacman {
    /**
     * @param {Object} options - {@link JsPacman} options plus:
     * @param {string} options.room - Room name.
     * @param {string} [options.serverUrl] - WebSocket origin (`ws://host:8000`).
     * @param {string} [options.role='pacman'] - Our role: `pacman` | `madame_pacman`
     *   | `baby` | `blocker` | `ghost` | `builder`.
     * @param {string} [options.playerName] - Display name (from the lobby / account).
     * @param {boolean} [options.autoStart] - Skip the splash and start at once
     *   (set by the lobby, which already had everyone press "ready").
     */
    constructor(options = {}) {
        super(options);

        this.role = options.role || 'pacman';
        /** Watch-only: no Pac-Man, no avatar, no input, nothing sent. */
        this._isSpectator = this.role === 'spectator';
        this._localIsPacman = !this._isSpectator &&
            PACMAN_ROLES.indexOf(this.role) !== -1;
        /** Our display name, announced to the room via role metadata. */
        this._name = String(options.playerName || '').slice(0, 20);
        /** Come from the lobby: leave the splash on our own. */
        this._autoStart = !!options.autoStart;

        /** Ghost/Builder sprite the local player drives (ghost/builder roles). */
        this.avatar = null;

        /** @type {Map<string, Character>} remote player id -> sprite */
        this.remotes = new Map();
        /** @type {Map<string, string>} remote player id -> role */
        this._roles = new Map();
        /** @type {Map<string, string>} remote player id -> display name */
        this._names = new Map();
        this._selfId = null;

        /** Temporary walls dropped by Builder players (shared across the room). */
        this.walls = new WallLayer(this);
        this._lastWallAt = 0;

        this.net = new NetClient({ room : options.room, url : options.serverUrl });
        this.net.on('open', () => this._onOpen());
        this.net.on('join', id => this._onJoin(id));
        this.net.on('leave', id => this._onLeave(id));
        this.net.on('pos', (id, pos, dir) => this._onPos(id, pos, dir));
        this.net.on('role', (id, role, meta) => this._onRole(id, role, meta));
        this.net.on('wall', (id, col, row, ttl, kind) => this.walls.add(
            col, row, ttl || WALL_TTL_SECONDS,
            kind === 'blocker' ? BLOCKER_WALL_CODE : BUILDER_WALL_CODE
        ));
        this.net.on('walldestroy', (col, row) => this.walls.removeAt(col, row));
        this.net.on('roundover', (id, winner) => this._showRoundResult(winner));
        this.net.on('roundrestart', () => this._restartRound());
        this.net.on('power', (id, kind, x, y) => this._onPower(kind, x, y));
        this.net.on('baby', (id, kind, x, y) => this._onBaby(kind, x, y));
        this.net.on('doteaten', (col, row, by) => this._onDotEaten(col, row, by));
        this.net.on('sync', snapshot => this._onSync(snapshot));
        this.net.on('roundstarted', () => this._onRoundStarted());
        this.net.on('caught', pid => this._onPlayerCaught(pid));
        this.net.on('ghosthome', ghostId => this._onGhostSentHome(ghostId));
        this.net.on('imprisoned', (pid, seconds) => this._onPlayerImprisoned(pid, seconds));
        this.net.connect();

        /** Authoritative per-player data from the last `state_sync`. */
        this._serverScores = {};
        this._serverRoles = {};
        /** Winner of the current round once it ends (null while playing). */
        this._resultWinner = null;
        /** True once we have told the server our round is running. */
        this._roundAnnounced = false;

        /** `Date.now()` until which Pac-Man can eat ghosts (0 = not frightened). */
        this._frightenedUntil = 0;
        this._wasScared = false;
        /** Debounce: last time we reported a ghost contact to the server. */
        this._lastContactAt = 0;

        this._lastPowerAt = 0;
        /** Timestamp until which our Pac-Man is frozen (0 = not frozen). */
        this._frozenUntil = 0;

        /** Blocker only: timestamp until which our Pac-Man is imprisoned (0 = free). */
        this._imprisonedUntil = 0;
        this._wasImprisoned = false;
        /** Debounce: last time our Blocker dropped a wall / walked over one to destroy it. */
        this._lastBlockerWallAt = 0;

        /** Baby Pac-Man sprite once born (null otherwise). */
        this._baby = null;
        /** Papa (role `pacman`) has eaten a fruit → a baby can be born. */
        this._papaAteFruit = false;

        /** True once a round has ended (all dots eaten, ...). */
        this._roundOver = false;

        // Runs every frame, even on the splash screen, independent of mainLoop.
        this.addCallback(() => this._netTick(), this.refreshRate);

        if (this._isSpectator) {
            this._setupSpectator();
        } else if (this._localIsPacman) {
            this._blockPacmanOnBuilderWalls();
            this._hookPacmanDots();
            this._disarmAiGhosts();
        } else {
            this._setupLocalAvatar();
        }

        if (!this._isSpectator) this._styleLocalBody();
    }

    /**
     * Filtre CSS « au repos » du perso local = accent de rôle + halo « toi ».
     * Les effets (gel, prison, effrayé) reviennent à ça, pas à ''.
     * @private
     */
    _localLook() {
        return ((ROLE_LOOK[this.role] || '') + ' ' + SELF_GLOW).trim();
    }

    /**
     * Applique {@link _localLook} au corps qu'on pilote (Pac-Man ou avatar).
     * @private
     */
    _styleLocalBody() {
        const body = this._localIsPacman ? this.pacman : this.avatar;
        if (body && body.el) body.el.style.filter = this._localLook();
    }

    /**
     * Watch-only mode: park the base Pac-Man, drop the AI ghosts, and show a
     * "SPECTATEUR" banner + a live scoreboard fed by `state_sync`. We never send
     * a position or a `round_start`; everything on screen is other players.
     * @private
     */
    _setupSpectator() {
        this.pacman.hide();
        this.pacman._speed = 0;
        this.pacman.speed = 0;
        this.off('game:ghost:eat');
        this.pacman.off('item:life');
        this.pacman.off('item:die');
        this._disarmAiGhosts();
        this.hideGhosts();

        // The base score header (1UP / HIGH SCORE) is meaningless watch-only.
        const hud = this.el.querySelector('.score');
        if (hud) hud.style.visibility = 'hidden';

        const box = document.createElement('div');
        Object.assign(box.style, {
            position : 'absolute', left : '0', right : '0', top : '0',
            display : 'flex', flexDirection : 'column', alignItems : 'center',
            gap : '5px', padding : '10px 6px', font : '11px monospace',
            color : '#ffd83d', background : 'rgba(0,0,0,0.72)', zIndex : '45',
            pointerEvents : 'none', textAlign : 'center'
        });
        box.innerHTML = '<div style="font-weight:bold;letter-spacing:1px">\u{1F441} MODE SPECTATEUR</div>'
            + '<div class="mp-spec-board" style="color:#fff"></div>';
        this.el.appendChild(box);
        this._specBoard = box.querySelector('.mp-spec-board');
    }

    /**
     * Refresh the spectator scoreboard from the last `state_sync`.
     * @private
     */
    _updateSpectatorBoard() {
        if (!this._specBoard) return;
        const rows = this._scoreboardRows();
        this._specBoard.textContent = rows.length
            ? rows.map(r => `${r.label} ${r.score}`).join('   •   ')
            : 'en attente des joueurs…';
    }

    /**
     * Report every dot / pill our Pac-Man eats to the server, which owns the
     * shared dot grid and the score. The base handlers still run locally
     * (sprite removal, sound); the local score stays as a prediction.
     * @private
     */
    _hookPacmanDots() {
        if (!this.pacman || this.pacman._dotsHooked) return;
        this.pacman._dotsHooked = true;
        this.pacman.on('item:eatdot', tile => this.net.sendEatDot(tile.col, tile.row));
        this.pacman.on('item:eatpill', tile => this.net.sendEatDot(tile.col, tile.row));
    }

    /**
     * Palier 4: real combat is back, but only between *players*. The AI ghosts
     * are decoration in multiplayer - stop them emitting the catch event so
     * they can't kill our Pac-Man, while keeping the `game:ghost:eat` -> death
     * chain intact for a server `player_caught`.
     * @private
     */
    _disarmAiGhosts() {
        ['pinky', 'blinky', 'inky', 'sue'].forEach(name => {
            const ghost = this[name];
            if (ghost) ghost.off('item:eat');
        });
    }

    /**
     * All dots eaten *on this client*. The server owns the shared dot grid and
     * decides when the round is really over, broadcasting `round_over` to
     * everyone. Suppress the base game's local win so a per-client dot miscount
     * can't end the round early.
     */
    win() {}

    /**
     * Show the end-of-round banner and stop the game loop.
     * @param {string} winner
     * @private
     */
    _showRoundResult(winner) {
        this._roundOver = true;
        this._resultWinner = winner;
        // Un `state_sync` final suit d'habitude ce `round_over` (scores exacts) ;
        // on le redemande au cas où, et `_onSync` rafraîchira le bandeau.
        this.net.requestSync();
        this._renderResultBanner();
    }

    /**
     * (Re)build the end-of-round banner: winner line + final scoreboard from the
     * last `state_sync`. Called again when a fresh sync lands so the shown
     * scores are the authoritative final ones.
     * @private
     */
    _renderResultBanner() {
        if (!this._resultWinner) return;
        if (this._resultEl) {
            this._resultEl.remove();
            this._resultEl = null;
        }

        const banner = document.createElement('div');
        Object.assign(banner.style, {
            position : 'absolute',
            left : '0', right : '0', top : '0', bottom : '0',
            display : 'flex',
            flexDirection : 'column',
            alignItems : 'center',
            justifyContent : 'center',
            font : 'bold 26px monospace',
            color : '#ffd83d',
            background : 'rgba(0, 0, 0, 0.78)',
            textAlign : 'center',
            zIndex : 50
        });

        const title = document.createElement('div');
        title.textContent = this._resultWinner === 'pacman'
            ? 'PAC-MAN A GAGNÉ !'
            : 'LES FANTÔMES ONT GAGNÉ !';
        banner.appendChild(title);

        const rows = this._scoreboardRows();
        if (rows.length) {
            const board = document.createElement('div');
            Object.assign(board.style, {
                marginTop : '18px', font : '14px monospace',
                color : '#fff', lineHeight : '1.6'
            });
            for (const row of rows) {
                const line = document.createElement('div');
                line.textContent = `${row.label} — ${row.score}`;
                if (row.isSelf) line.style.color = '#ffd83d';
                board.appendChild(line);
            }
            banner.appendChild(board);
        }

        const hint = document.createElement('div');
        hint.textContent = 'Espace = rejouer';
        Object.assign(hint.style, { marginTop : '16px', fontSize : '13px', color : '#aaa' });
        banner.appendChild(hint);

        this.el.appendChild(banner);
        this._resultEl = banner;
    }

    /**
     * Final per-player scores for the end screen: `[{label, score, isSelf}]`
     * sorted high → low. Labels use the player's display name (from the lobby)
     * when known, otherwise its role; the local player is marked `(toi)`.
     * @private
     */
    _scoreboardRows() {
        const ROLE_LABEL = {
            pacman : 'Pac-Man', madame_pacman : 'Ms Pac-Man', baby : 'Bébé',
            blocker : 'Blocker', ghost : 'Fantôme', builder : 'Builder'
        };
        const scores = this._serverScores || {};
        const roles = this._serverRoles || {};
        return Object.keys(scores)
            .map(pid => {
                const isSelf = pid === this._selfId;
                const role = isSelf ? this.role : (roles[pid] || this._roles.get(pid));
                const name = isSelf ? this._name : this._names.get(pid);
                const label = (name || ROLE_LABEL[role] || 'Joueur') +
                    (isSelf ? ' (toi)' : '');
                return { label : label, score : scores[pid], isSelf : isSelf };
            })
            .sort((a, b) => b.score - a.score);
    }

    /**
     * The room confirms a shared round is live (some client sent `round_start`).
     * Mark it announced so we never send a duplicate - covers a client that
     * joined mid-round and whose local loop reaches play later.
     * @private
     */
    _onRoundStarted() {
        this._roundAnnounced = true;
    }

    /**
     * Clear the banner and start a fresh round (local; a broadcast tells the
     * others to do the same).
     * @private
     */
    _restartRound() {
        if (!this._roundOver) return;
        this._roundOver = false;
        this._resultWinner = null;
        this._restartRequested = false;
        if (this._resultEl) {
            this._resultEl.remove();
            this._resultEl = null;
        }
        this.model.level = 1;
        this.reset();
        this.model.status = STATUS_PLAY;
    }

    /**
     * Base game loop, plus driving our ghost/Builder avatar when we have one.
     */
    mainLoop() {
        if (this._roundOver) return;

        super.mainLoop();

        if (this._isSpectator) {
            // The base intro/respawn code keeps re-showing them - keep watch-only.
            this.pacman.hide();
            this.hideGhosts();
            return;
        }

        // Les fantômes IA ne sont pas des joueurs : on les masque en multi pour
        // qu'on ne les confonde pas avec les vrais fantômes pilotés (le moteur
        // de base les ré-affiche à certaines transitions, d'où le hide chaque
        // frame). `_disarmAiGhosts` les a déjà rendus inoffensifs.
        this.hideGhosts();

        if (this._localIsPacman || !this.avatar) return;

        // The base intro/respawn code keeps re-showing Pac-Man; keep it hidden.
        this.pacman.hide();

        if (this.model.status !== STATUS_PLAY || this._pauseFrames) return;

        // Everyone starts together: the avatar only leaves the house once the
        // round is really playing, then slides out like a real ghost.
        if (this._avatarInHouse) {
            this._exitHouse();
            return;
        }

        // Character movement (wall collision), not the ghost chase AI.
        Character.prototype.move.call(this.avatar, this._arrowDirection());

        this._maybeDropWall();
        this._maybeUseFreeze();
    }

    /**
     * Ghost role only: space bar freezes the nearest Pac-Man in range for a few
     * seconds. Announced from the avatar's position; each client freezes its own
     * Pac-Man if it is close enough.
     * @private
     */
    _maybeUseFreeze() {
        if (this.role !== 'ghost' || !this.avatar) return;
        if (!this.keyboard.keys[KEY_ACTION]) return;

        const now = Date.now();
        if (now - this._lastPowerAt < FREEZE_COOLDOWN_MS) return;

        this._lastPowerAt = now;
        this.net.sendPower('freeze', this.avatar.x, this.avatar.y);
    }

    /**
     * A power was used somewhere. Freeze applies to our Pac-Man if it stands
     * within {@link FREEZE_RANGE_PX} of where the ghost triggered it.
     * @private
     */
    _onPower(kind, x, y) {
        if (kind !== 'freeze') return;
        if (!this._localIsPacman || !this.pacman) return;
        if (typeof x !== 'number' || typeof y !== 'number') return;

        const dx = this.pacman.x - x;
        const dy = this.pacman.y - y;
        if (dx * dx + dy * dy <= FREEZE_RANGE_PX * FREEZE_RANGE_PX) {
            this._frozenUntil = Date.now() + FREEZE_MS;
        }
    }

    // ===================== shared dot grid (server-owned) =====================

    /**
     * The server accepted a dot being eaten. If someone else ate it, clear the
     * matching tile on our map so both boards stay in sync. Our own eats were
     * already applied locally (optimistic), so ignore the echo.
     * @private
     */
    _onDotEaten(col, row, by) {
        if (by === this._selfId) return;
        const tile = this.map && this.map.getTile(col, row);
        if (tile && tile.item) {
            tile.item.destroy();
            tile.item = null;
        }
    }

    /**
     * Authoritative shared state. Reconcile our local dot grid with it both
     * ways (drop dots the server cleared, recreate ones it still lists) and
     * stash the per-player scores / roles for the end-of-round scoreboard.
     * @private
     */
    _onSync(snapshot) {
        if (!this.map || this.state !== STATE_RUNNING) return;
        this._serverScores = snapshot.scores || {};
        this._serverRoles = snapshot.roles || {};
        this._frightenedUntil = Date.now() + (snapshot.frightened_ms || 0);
        if (this._roundOver) this._renderResultBanner();
        if (this._isSpectator) this._updateSpectatorBoard();

        // Keep our HUD life count roughly server-authoritative. Never push it to
        // 0 through here (that would trip the base GAME OVER screen - the server
        // sends `round_over` instead) and never while a death spin is playing.
        if (this._localIsPacman && !this._pacmanEaten) {
            const serverLives = (snapshot.lives || {})[this._selfId];
            if (typeof serverLives === 'number' && serverLives > 0 &&
                this.model.lives !== serverLives) {
                this.model.lives = serverLives;
            }
        }

        const live = new Set();
        for (const cell of snapshot.dots || []) live.add(cell[0] + ',' + cell[1]);
        for (const cell of snapshot.pellets || []) live.add(cell[0] + ',' + cell[1]);

        for (const tile of this.map.tiles) {
            const isItemTile = tile.code === '.' || tile.code === '*';
            if (!isItemTile) continue;
            const wanted = live.has(tile.col + ',' + tile.row);

            if (tile.item && !wanted) {
                tile.item.destroy();
                tile.item = null;
            } else if (!tile.item && wanted) {
                this._makeItemFor(tile);
            }
        }
    }

    /**
     * Recreate the dot / pill sprite on `tile`, matching what `makeLevel` does
     * (Phase 1 is always maze-1 → `white` dots).
     * @private
     */
    _makeItemFor(tile) {
        const make = tile.code === '*' ? makePill : makeDot;
        const item = make({
            defaultAnimation : 'white',
            map : this.map,
            factor : this.scaling.getFactor(),
            normalizeRefreshRate : this.normalizeRefreshRate.bind(this),
            x : tile.x,
            y : tile.y
        });
        tile.item = item;
        item.load();
        this.addSprite(item);
    }

    // ===================== baby Pac-Man =====================

    /**
     * Attach the "papa ate a fruit" flag to the current bonus sprite (once).
     * @private
     */
    _hookBonus() {
        if (this.role !== 'pacman' || !this.bonus || this.bonus._babyHooked) return;
        this.bonus._babyHooked = true;
        this.bonus.on('item:eaten', () => { this._papaAteFruit = true; });
    }

    /**
     * Papa (role `pacman`) only: if he has eaten a fruit and bumps into a
     * `madame_pacman`, a baby is born and starts heading for a side tunnel.
     * @private
     */
    _checkBabyBirth() {
        if (this.role !== 'pacman' || !this.pacman || this._baby || !this._papaAteFruit) return;
        if (this.model.status !== STATUS_PLAY) return;

        for (const remote of this.remotes.values()) {
            if (remote._role === 'madame_pacman'
                && Math.abs(this.pacman.x - remote.x) < 24
                && Math.abs(this.pacman.y - remote.y) < 24) {
                this._spawnBaby(this.pacman.x, this.pacman.y);
                this.net.sendBaby('spawn', this.pacman.x, this.pacman.y);
                return;
            }
        }
    }

    /**
     * Create the baby sprite. The papa's copy runs the AI (walk to the nearest
     * tunnel); every other client just renders it from network position.
     * @private
     */
    _spawnBaby(x, y) {
        if (this._baby) return;

        const amPapa = this.role === 'pacman';
        this._baby = makePacmanBaby({
            ...this._pacmanAttrs(),
            x : x,
            y : y,
            speed : 60,
            getFollowTarget : amPapa ? () => this._babyTarget() : null
        });

        // Strip the Pac-Man `item:tile` handler: it eats dots (clearing a path)
        // and, without level speed settings, drops `_speed` to null on a dot,
        // freezing the baby. Keep only the turn animation.
        this._baby.off('item:tile');
        this._baby.on('item:tile', () => this._baby.setNextAnimation());

        this._baby._netX = x;
        this._baby._netY = y;
        this._baby.el.style.filter = 'brightness(1.2) saturate(1.6)';
        this._baby.load();
        this.addSprite(this._baby);
        this._papaAteFruit = false;
    }

    /**
     * @private
     * @returns {Tile|null} Nearest side-tunnel tile to the baby.
     */
    _babyTarget() {
        const tunnels = this.map.tunnels;
        if (!tunnels || !tunnels.length || !this._baby) return null;

        const here = this._baby.getTile();
        let best = tunnels[0];
        let bestDist = Infinity;
        for (const tunnel of tunnels) {
            const d = (tunnel.col - here.col) ** 2 + (tunnel.row - here.row) ** 2;
            if (d < bestDist) {
                bestDist = d;
                best = tunnel;
            }
        }
        return best;
    }

    /**
     * Per-frame baby update. Papa: move it, broadcast, resolve escape / capture.
     * Others: interpolate from the last network position.
     * @private
     */
    _updateBaby() {
        if (!this._baby) return;
        this._baby.map = this.map;

        if (this.role !== 'pacman') {
            const k = 0.3;
            this._baby.x += (this._baby._netX - this._baby.x) * k;
            this._baby.y += (this._baby._netY - this._baby.y) * k;
            this._baby.update();
            return;
        }

        this._baby.move();
        this.net.sendBaby('move', this._baby.x, this._baby.y);

        const near = r => Math.abs(this._baby.x - r.x) < 22 && Math.abs(this._baby.y - r.y) < 22;
        for (const remote of this.remotes.values()) {
            if (PACMAN_ROLES.indexOf(remote._role) === -1 && near(remote)) {
                this.net.sendBaby('died', this._baby.x, this._baby.y);
                this._babyGone(false);
                return;
            }
        }

        const tile = this._baby.getTile();
        if (tile && tile.isTunnel()) {
            this.net.sendBaby('escape', this._baby.x, this._baby.y);
            this._babyGone(true);
        }
    }

    /**
     * Baby lifecycle event from the papa.
     * @private
     */
    _onBaby(kind, x, y) {
        if (kind === 'spawn') {
            if (!this._baby) this._spawnBaby(x, y);
        } else if (kind === 'move') {
            if (this._baby && this.role !== 'pacman') {
                this._baby._netX = x;
                this._baby._netY = y;
            }
        } else if (kind === 'escape') {
            this._babyGone(true);
        } else if (kind === 'died') {
            this._babyGone(false);
        }
    }

    /**
     * Remove the baby. If it escaped, our Pac-Man (if we play one) gains a life.
     * @private
     */
    _babyGone(escaped) {
        if (!this._baby) return;
        this._baby.destroy();
        this._baby = null;

        if (escaped && this._localIsPacman) {
            this.model.lives++;
            this._flash('+1 VIE');
        }
    }

    /**
     * Brief centred text flash.
     * @private
     */
    _flash(text) {
        const el = document.createElement('div');
        el.textContent = text;
        Object.assign(el.style, {
            position : 'absolute',
            left : '0', right : '0', top : '40%',
            textAlign : 'center',
            font : 'bold 22px monospace',
            color : '#7CFC00',
            textShadow : '0 0 6px #000',
            zIndex : 40,
            pointerEvents : 'none'
        });
        this.el.appendChild(el);
        window.setTimeout(() => el.remove(), 1400);
    }

    /**
     * Scripted one-time slide from the house centre to the corridor just above
     * the door. Ends by handing control back (`_avatarInHouse = false`).
     * @private
     */
    _exitHouse() {
        const a = this.avatar;
        const doorX = this.map.house.getR().x - this.map.tileWidth / 2;
        const outY = this.map.house.getU().y;
        const speed = 4;

        if (Math.abs(a.x - doorX) > speed) {
            a.dir = a.x < doorX ? 'r' : 'l';
            a.x += a.dir === 'r' ? speed : -speed;
        } else if (a.y > outY + speed) {
            a.x = doorX;
            a.dir = 'u';
            a.y -= speed;
        } else {
            a.x = doorX;
            a.y = outY;
            a.dir = 'l';
            this._avatarInHouse = false;
        }

        a.setNextAnimation();
        a.update();
    }

    /**
     * Builder only: space bar drops a temporary wall on the tile just behind us,
     * announced to the whole room (every client, us included, applies it on the
     * echo through {@link WallLayer}).
     * @private
     */
    _maybeDropWall() {
        if (this.role !== 'builder' || !this.avatar) return;
        if (!this.keyboard.keys[KEY_ACTION]) return;

        const now = Date.now();
        if (now - this._lastWallAt < WALL_COOLDOWN_MS) return;

        const here = this.avatar.getTile();
        if (!here) return;

        const back = OPPOSITE_DIR[this.avatar.dir];
        const target = (back && here.get(back)) || here;
        if (target.isWall() || target.isHouse() || target.isTunnel()) return;

        this._lastWallAt = now;
        this.net.sendWall(target.col, target.row, WALL_TTL_SECONDS, 'builder');
    }

    /**
     * Blocker only: space bar drops an anti-ghost wall on the tile just behind
     * our Pac-Man - the mirror image of the Builder's wall, but it blocks
     * ghost/Builder avatars instead of Pac-Men.
     * @private
     */
    _maybeDropBlockerWall() {
        if (this.role !== 'blocker' || !this.pacman) return;
        if (!this.keyboard.keys[KEY_ACTION]) return;

        const now = Date.now();
        if (now - this._lastBlockerWallAt < WALL_COOLDOWN_MS) return;

        const here = this.pacman.getTile();
        if (!here) return;

        const back = OPPOSITE_DIR[this.pacman.dir];
        const target = (back && here.get(back)) || here;
        if (target.isWall() || target.isHouse() || target.isTunnel()) return;

        this._lastBlockerWallAt = now;
        this.net.sendWall(target.col, target.row, WALL_TTL_SECONDS, 'blocker');
    }

    /**
     * Blocker only: walking onto a Builder wall destroys it, for everyone.
     * Self-limiting - once the wall is gone the tile code changes, so this
     * stops firing until a fresh Builder wall appears underfoot.
     * @private
     */
    _maybeDestroyWall() {
        if (this.role !== 'blocker' || !this.pacman) return;

        const tile = this.pacman.getTile();
        if (!tile || tile.code !== BUILDER_WALL_CODE) return;

        this.walls.removeAt(tile.col, tile.row);
        this.net.sendWallDestroy(tile.col, tile.row);
    }

    /**
     * Rebuild the avatar when the base class rebuilds the level.
     */
    reset() {
        if (this.avatar) {
            this.avatar.destroy();
            this.avatar = null;
        }
        this.walls.clear();
        this._frozenUntil = 0;
        this._wasFrozen = false;
        this._imprisonedUntil = 0;
        this._wasImprisoned = false;
        this._frightenedUntil = 0;
        this._wasScared = false;
        this._lastContactAt = 0;
        this._papaAteFruit = false;
        if (this._baby) {
            this._baby.destroy();
            this._baby = null;
        }
        super.reset();
        if (this._localIsPacman) {
            this._blockPacmanOnBuilderWalls();
            this._hookPacmanDots();
            this._disarmAiGhosts();
        } else {
            this._setupLocalAvatar();
        }
        if (!this._isSpectator) this._styleLocalBody();
        // The level was rebuilt: re-announce our round so the server (re)seeds
        // and switches to `playing`.
        this._roundAnnounced = false;
    }

    /**
     * Builder walls (`BUILDER_WALL_CODE`) must stop Pac-Men but not ghosts. The
     * engine's `isWall()` only knows `'='`, so ghosts already ignore them; here
     * we add the missing check to our own Pac-Man's `canGo`. Remote Pac-Men are
     * blocked the same way on their own client, so their broadcast positions
     * already respect the walls.
     *
     * The Blocker is exempt: it needs to walk onto a Builder wall to destroy it
     * (see `_maybeDestroyWall`), so it passes through like a ghost would.
     * @private
     */
    _blockPacmanOnBuilderWalls() {
        const pac = this.pacman;
        if (!pac || pac._wallCheckPatched || this.role === 'blocker') return;

        const canGo = pac.canGo.bind(pac);
        pac.canGo = dir => {
            if (!canGo(dir)) return false;
            const next = pac.getTile().get(dir);
            return !next || next.code !== BUILDER_WALL_CODE;
        };
        pac._wallCheckPatched = true;
    }

    /**
     * Blocker walls (`BLOCKER_WALL_CODE`) mirror Builder walls the other way:
     * they stop our ghost / Builder avatar but not Pac-Men. Same technique as
     * `_blockPacmanOnBuilderWalls`, patching the avatar's `canGo` instead.
     * @private
     */
    _blockGhostOnBlockerWalls() {
        const avatar = this.avatar;
        if (!avatar || avatar._wallCheckPatched) return;

        const canGo = avatar.canGo.bind(avatar);
        avatar.canGo = dir => {
            if (!canGo(dir)) return false;
            const next = avatar.getTile().get(dir);
            return !next || next.code !== BLOCKER_WALL_CODE;
        };
        avatar._wallCheckPatched = true;
    }

    /**
     * Ghost/Builder players don't steer the base Pac-Man - keep it still.
     * Blocker only: also frozen while imprisoned.
     * @returns {string|null}
     */
    _getInputDirection() {
        if (!this._localIsPacman) return null;
        if (this._frozenUntil && Date.now() < this._frozenUntil) return null;
        if (this._imprisonedUntil && Date.now() < this._imprisonedUntil) return null;
        return super._getInputDirection();
    }

    /**
     * Apply / lift the freeze effect on our Pac-Man each frame (speed 0 + an icy
     * tint while frozen).
     * @private
     */
    _updateFreeze() {
        if (!this._localIsPacman || !this.pacman) return;

        const frozen = this._frozenUntil > Date.now();
        if (frozen === this._wasFrozen) return;
        this._wasFrozen = frozen;

        if (frozen) {
            this._speedBeforeFreeze = this.pacman.speed;
            this.pacman.speed = 0;
            this.pacman._speed = 0;
            this.pacman.el.style.filter = 'brightness(1.4) hue-rotate(150deg) saturate(2.5)';
        } else {
            this.pacman.speed = this._speedBeforeFreeze || this.pacman.speed;
            this.pacman._speed = this.pacman.speed;
            this.pacman.el.style.filter = this._localLook();
        }
    }

    /**
     * Server verdict: a ghost caught our Blocker. It never dies - it's
     * imprisoned instead, immobilised for `seconds` and then released on its
     * own (no round-over check, no life lost).
     * @private
     */
    _onPlayerImprisoned(pid, seconds) {
        if (pid !== this._selfId || !this._localIsPacman) return;
        this._imprisonedUntil = Date.now() + seconds * 1000;
    }

    /**
     * Apply / lift the imprisonment effect on our Blocker each frame (speed 0
     * + a distinct reddish tint while imprisoned).
     * @private
     */
    _updateImprisoned() {
        if (!this._localIsPacman || !this.pacman) return;

        const imprisoned = this._imprisonedUntil > Date.now();
        if (imprisoned === this._wasImprisoned) return;
        this._wasImprisoned = imprisoned;

        if (imprisoned) {
            this._speedBeforeImprison = this.pacman.speed;
            this.pacman.speed = 0;
            this.pacman._speed = 0;
            this.pacman.el.style.filter = 'sepia(1) hue-rotate(320deg) saturate(3) brightness(0.9)';
        } else {
            this.pacman.speed = this._speedBeforeImprison || this.pacman.speed;
            this.pacman._speed = this.pacman.speed;
            this.pacman.el.style.filter = this._localLook();
        }
    }

    /**
     * A ghost caught our Pac-Man: keep the base death sequence (lose a life,
     * respawn). The round only ends once lives hit zero - see `_onChangeLives`.
     * @private
     */
    _onGhostEat() {
        if (this._localIsPacman) super._onGhostEat();
    }

    /**
     * @private
     */
    _onGhostEaten(ghost) {
        if (this._localIsPacman) super._onGhostEaten(ghost);
    }

    /**
     * Keep the HUD life counter, but never trigger the base GAME OVER screen:
     * in multiplayer the server decides the round is over (ghosts win once
     * every Pac-Man player is out of lives) and broadcasts `round_over`.
     * @private
     */
    _onChangeLives(model, lives) {
        if (lives > 0) super._onChangeLives(model, lives);
    }

    /**
     * A remote ghost / Builder overlapping our Pac-Man is reported to the
     * server, which owns the outcome (`player_caught` = a life lost, or
     * `ghost_home` during a power-pellet window). Debounced so a single contact
     * isn't reported every frame. We only ever check *our* Pac-Man; remote
     * pacmen report their own contacts.
     * @private
     */
    _checkGhostCatch() {
        if (this._roundOver || this.model.status !== STATUS_PLAY) return;
        if (!this._localIsPacman || !this.pacman || this._pacmanEaten) return;
        if (Date.now() - this._lastContactAt < 1200) return;

        const isPacRole = role => PACMAN_ROLES.indexOf(role) !== -1;
        const near = r => Math.abs(this.pacman.x - r.x) < 18 && Math.abs(this.pacman.y - r.y) < 18;

        for (const [id, remote] of this.remotes) {
            if (!isPacRole(remote._role) && near(remote)) {
                this._lastContactAt = Date.now();
                this.net.sendContact(id);
                return;
            }
        }
    }

    /**
     * Server verdict: a ghost caught a Pac-Man. If it's ours, play the death
     * sequence (spin, lose a life, respawn). The base death chain drops one
     * life on its own (`item:life`); `_onSync` reconciles any drift with the
     * server. Any round-over banner comes separately from `round_over`.
     * @private
     */
    _onPlayerCaught(pid) {
        if (pid !== this._selfId || !this._localIsPacman) return;
        if (this._pacmanEaten || this._roundOver) return;
        this.emit('game:ghost:eat');
    }

    /**
     * Server verdict: a frightened Pac-Man ate the ghost `ghostId`. If that's
     * us, send our avatar back to the house (ghost / Builder role only); the
     * eater's score bump reaches everyone via the next `state_sync`.
     * @private
     */
    _onGhostSentHome(ghostId) {
        if (ghostId !== this._selfId || this._localIsPacman || !this.avatar) return;
        const hc = this.map.houseCenter;
        this.avatar.x = hc.x;
        this.avatar.y = hc.y;
        this.avatar.dir = null;
        this.avatar._dir = null;
        this.avatar._nextDir = null;
        this._avatarInHouse = true;
    }

    /**
     * Tint our ghost / Builder avatar blue while a power pellet is active, so
     * the player knows they can be eaten. No-op for Pac-Man players.
     * @private
     */
    _updateFrightenedTint() {
        if (this._localIsPacman || !this.avatar) return;
        const scared = this._frightenedUntil > Date.now();
        if (scared === this._wasScared) return;
        this._wasScared = scared;
        this.avatar.el.style.filter = scared
            ? 'brightness(0.7) sepia(1) hue-rotate(200deg) saturate(4)'
            : this._localLook();
    }

    /**
     * Per-frame network work: broadcast our position, interpolate the others.
     * @private
     */
    _netTick() {
        if (!this.net.connected) return;

        // Came from the lobby: leave the splash on our own once the engine has
        // finished preloading (everyone already pressed "ready" over there).
        if (this._autoStart && this.state === STATE_RUNNING &&
            this.model.status === STATUS_SPLASH) {
            this._autoStart = false;
            this.startLevel();
        }

        if (this._roundOver) {
            if (this.keyboard.keys[KEY_ACTION] && !this._restartRequested) {
                this._restartRequested = true;
                this.net.sendRoundRestart();
            }
            return;
        }

        this._updateFreeze();
        this._updateImprisoned();
        this._maybeDropBlockerWall();
        this._maybeDestroyWall();
        this._checkGhostCatch();
        this._updateFrightenedTint();
        this._hookBonus();
        this._checkBabyBirth();
        this._updateBaby();

        if (this._selfId && this.remotes.has(this._selfId)) {
            // A role echo can briefly create a remote for ourselves before we
            // learn our own id - drop it as soon as we do.
            this._onLeave(this._selfId);
        }

        // First frame of real play: tell the server our round is running so it
        // seeds the shared dot grid and starts sending `state_sync`. A spectator
        // never drives the round.
        if (!this._isSpectator && this.model.status === STATUS_PLAY &&
            !this._roundAnnounced) {
            this._roundAnnounced = true;
            this.net.sendRoundStart();
        }

        const body = this._isSpectator ? null
            : (this._localIsPacman ? this.pacman : this.avatar);
        if (body && this.model.status === STATUS_PLAY) {
            this.net.sendPosition(body.x, body.y, body.dir || 'l');
        }

        // Drop remotes gone quiet for 3s (left without a clean `player_left`,
        // crashed, or a stale id from a reconnect).
        const now = Date.now();
        this.remotes.forEach((remote, id) => {
            if (now - (remote._lastSeen || 0) > 3000) this._onLeave(id);
            else this._interpolate(remote);
        });

        this.walls.update();
    }

    /**
     * Hide + freeze the base Pac-Man (kept at its normal spawn so the AI ghosts
     * still chase a valid in-bounds target) and spawn the ghost/Builder we
     * actually drive.
     * @private
     */
    _setupLocalAvatar() {
        this.pacman.hide();
        this.pacman._speed = 0;
        this.pacman.speed = 0;

        // The AI ghosts still touch the frozen Pac-Man and would "kill" it,
        // which drops lives and bounces the status back to intro. Cut those
        // event chains - we're not playing a Pac-Man.
        this.off('game:ghost:eat');
        this.pacman.off('item:life');
        this.pacman.off('item:die');

        // Start inside the ghost house, dead centre, like the caged ghosts.
        const hc = this.map.houseCenter;
        this.avatar = this.role === 'builder'
            ? makeBuilder({ ...this._ghostAttrs(), x : hc.x, y : hc.y })
            : makeGhost('blinky', { ...this._ghostAttrs(), x : hc.x, y : hc.y });

        // Drop the ghost chase AI: its `item:tile` handler recomputes a path
        // every tile and blows up when we steer it by hand. Keep only the
        // animation-on-turn behaviour.
        this.avatar.off('item:tile');
        this.avatar.on('item:tile', () => this.avatar.setNextAnimation());
        // Motionless (dir null) until the round actually starts, then it slides
        // out of the house before the player takes over - see `_exitHouse`.
        this.avatar.dir = null;
        this.avatar._dir = null;
        this.avatar._nextDir = null;
        this._avatarInHouse = true;

        this.avatar.el.style.filter = this._localLook();

        this.avatar.load();
        this.addSprite(this.avatar);
        this._blockGhostOnBlockerWalls();
    }

    /**
     * @private
     * @returns {string|null} Direction from the arrow keys.
     */
    _arrowDirection() {
        const keys = this.keyboard.keys;
        if (keys[KEY_UP]) return 'u';
        if (keys[KEY_RIGHT]) return 'r';
        if (keys[KEY_DOWN]) return 'd';
        if (keys[KEY_LEFT]) return 'l';
        return null;
    }

    /**
     * (Re)connected: our channel id has changed, so forget who we were and drop
     * every remote - each one comes back from its next position update. This is
     * what recovers cleanly from a server restart or a dropped socket.
     * @private
     */
    _onOpen() {
        this._selfId = null;
        this.remotes.forEach(remote => remote.destroy());
        this.remotes.clear();
        this._roles.clear();
        this.net.sendRole(this.role, { name : this._name });
    }

    /**
     * First `join` after (re)connecting is our own channel; remember it so we
     * never draw ourselves. Any later join is a newcomer who missed our first
     * role announce (the server only relays, it does not replay) - so repeat it.
     * @private
     */
    _onJoin(id) {
        if (!this._selfId) {
            this._selfId = id;
            return;
        }
        this.net.sendRole(this.role, { name : this._name });
    }

    /**
     * @private
     */
    _onLeave(id) {
        const remote = this.remotes.get(id);
        if (remote) {
            remote.destroy();
            this.remotes.delete(id);
        }
    }

    /**
     * A position update. Ignore our own echo; create the sprite the first time
     * we hear from a player (covers joining after someone and missing their
     * `join`).
     * @private
     */
    _onPos(id, pos, dir) {
        if (id === this._selfId) return;
        if (typeof pos.x !== 'number' || typeof pos.y !== 'number') return;

        let remote = this.remotes.get(id);
        if (!remote) {
            // Adding a sprite before the engine finished its preload would trip
            // its "are all animations ready?" check. Drop updates until then.
            if (this.state !== STATE_RUNNING) return;
            remote = this._addRemote(id, pos);
        }

        remote._netX = pos.x;
        remote._netY = pos.y;
        remote._netDir = dir;
        remote._lastSeen = Date.now();
    }

    /**
     * A player announced its role. Store it; if we already drew them with a
     * different role, rebuild the sprite in place.
     * @private
     */
    _onRole(id, role, meta) {
        if (id === this._selfId) return;
        if (meta && meta.name) this._names.set(id, String(meta.name).slice(0, 20));
        // A spectator has no sprite - drop any we drew for that id and stop.
        if (role === 'spectator') {
            this._roles.set(id, 'spectator');
            this._onLeave(id);
            return;
        }
        if (this._roles.get(id) === role) return;
        this._roles.set(id, role);

        const existing = this.remotes.get(id);
        if (!existing || existing._role === role) return;

        const pos = { x : existing.x, y : existing.y };
        const dir = existing._netDir;
        this._onLeave(id);

        if (this.state === STATE_RUNNING) {
            const rebuilt = this._addRemote(id, pos);
            rebuilt._netDir = dir;
        }
    }

    /**
     * Create a remote player sprite for `id` at `pos`, using its known role
     * (default `pacman`).
     * @private
     * @param {string} id
     * @param {{x:number, y:number}} pos
     * @returns {Character}
     */
    _addRemote(id, pos) {
        const role = this._roles.get(id) || 'pacman';
        const remote = this._makeRemoteSprite(role, pos, id);

        remote._role = role;
        remote._netX = pos.x;
        remote._netY = pos.y;
        remote._netDir = null;
        remote._lastSeen = Date.now();

        // Apparence par rôle, la même pour tout le monde (pas de teinte par
        // joueur : un Pac-Man doit rester jaune sur tous les écrans).
        remote.el.style.filter = ROLE_LOOK[role] || '';
        remote.el.style.opacity = '1';

        // Load images up front so the engine's preload loop never sees an
        // unloaded animation, then put it on screen.
        remote.load();
        this.addSprite(remote);
        this.remotes.set(id, remote);

        return remote;
    }

    /**
     * Shared engine wiring for a Pac-Man character (the hooks its constructor
     * calls; all no-ops for a network-driven one).
     * @private
     */
    _pacmanAttrs() {
        return {
            map : this.map,
            factor : this.scaling.getFactor(),
            normalizeRefreshRate : this.normalizeRefreshRate.bind(this),
            addGameGhostEatEventListener : noop,
            addGameGhostModeFrightenedEnter : noop,
            addGameGhostModeFrightenedExit : noop
        };
    }

    /**
     * Shared engine wiring for a ghost / Builder character.
     * @private
     */
    _ghostAttrs() {
        return {
            map : this.map,
            factor : this.scaling.getFactor(),
            normalizeRefreshRate : this.normalizeRefreshRate.bind(this),
            addGameGlobalModeEventListener : noop,
            addGameGhostEatenEventListener : noop,
            addPacmanEatPillEventListener : noop,
            getPacmanData : () => this.pacman.getPositionData()
        };
    }

    /**
     * Build the right sprite for a role, network-driven (no input, no AI).
     * @private
     */
    _makeRemoteSprite(role, pos, id) {
        const at = { x : pos.x, y : pos.y };

        switch (role) {
            case 'ghost':
                return makeGhost(GHOST_LABELS[this._hue(id) % GHOST_LABELS.length], { ...this._ghostAttrs(), ...at });
            case 'builder':
                return makeBuilder({ ...this._ghostAttrs(), ...at });
            case 'baby':
                return makePacmanBaby({ ...this._pacmanAttrs(), ...at });
            case 'madame_pacman':
                return makeMsPacman({ ...this._pacmanAttrs(), ...at });
            default:
                return makePacmanMan({ ...this._pacmanAttrs(), ...at });
        }
    }

    /**
     * Move a remote a fraction towards its last known network position. Keeps
     * its `map` reference fresh so it survives level changes.
     *
     * Interpolation follows the *shorter* way around the map, so a tunnel wrap
     * slides the sprite off one edge and back on the other (like the base game)
     * instead of streaking it across the whole maze.
     * @private
     */
    _interpolate(remote) {
        if (typeof remote._netX !== 'number') return;

        remote.map = this.map;

        const k = 0.3;
        const mapW = this.map.width * this.map.tileWidth;
        const mapH = this.map.height * this.map.tileHeight;

        remote.x = this._wrapLerp(remote.x, remote._netX, mapW, k);
        remote.y = this._wrapLerp(remote.y, remote._netY, mapH, k);

        if (remote._netDir && remote._netDir !== remote.dir) {
            remote.dir = remote._netDir;
            remote.setNextAnimation();
        }

        remote.update();
        // update() repositionne + (dé)pause l'anim mais n'avance pas la frame ;
        // le main loop du jeu de base le fait pour ses sprites, pas pour les
        // nôtres. Sans ça le chomp reste figé (Pac-Man = rond fermé).
        if (typeof remote.refresh === 'function') remote.refresh();
    }

    /**
     * Lerp `from` towards `to` on a wrapping axis of length `size`.
     * @private
     */
    _wrapLerp(from, to, size, k) {
        let delta = to - from;
        if (delta > size / 2) delta -= size;
        else if (delta < -size / 2) delta += size;

        let next = from + delta * k;
        if (next < 0) next += size;
        else if (next > size) next -= size;
        return next;
    }

    /**
     * Stable hue (0-359) from a player id, so each remote keeps its colour.
     * @private
     * @param {string} id
     * @returns {number}
     */
    _hue(id) {
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = (hash * 31 + id.charCodeAt(i)) % 360;
        }
        return hash;
    }

    /**
     * How many other players we are currently drawing.
     * @returns {number}
     */
    remoteCount() {
        return this.remotes.size;
    }

    /**
     * Tear down the socket and every remote sprite.
     */
    onDestroy() {
        this.net.disconnect();
        this.remotes.forEach(remote => remote.destroy());
        this.remotes.clear();
        this.walls.clear();
        if (this.avatar) this.avatar.destroy();
        if (this._baby) this._baby.destroy();
        super.onDestroy();
    }
}

export default MultiplayerGame;
