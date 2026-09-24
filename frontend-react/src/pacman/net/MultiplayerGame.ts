import JsPacman, { type JsPacmanOptions } from "../Game.ts";
import Character, { type Direction } from "../Character.ts";
import { STATE_RUNNING } from "../engine/Game.ts";
import { STATUS_PLAY, STATUS_SPLASH } from "../GameModel.ts";
import { KEY_UP, KEY_RIGHT, KEY_DOWN, KEY_LEFT } from "../engine/Keyboard.ts";
import makeMsPacman from "../factory/makeMsPacman.ts";
import makePacmanPlain from "../factory/makePacmanPlain.ts";
import { animations as PLAIN_PACMAN_ANIMATIONS } from "../PacmanPlain.ts";
import makePacmanBaby from "../factory/makePacmanBaby.ts";
import makeGhost, { type GhostLabel } from "../factory/makeGhost.ts";
import makeBuilder from "../factory/makeBuilder.ts";
import makeDot from "../factory/makeDot.ts";
import makePill from "../factory/makePill.ts";
import NetClient from "./NetClient.ts";
import WallLayer, { BUILDER_WALL_CODE, BLOCKER_WALL_CODE } from "./WallLayer.ts";
import type GhostClass from "../Ghost.ts";
import type PacmanBaby from "../PacmanBaby.ts";
import type Pacman from "../Pacman.ts";
import type Tile from "../Tile.ts";
import type GameModel from "../GameModel.ts";
import map1 from "../maps/map-1.ts";
import map2 from "../maps/map-2.ts";
import map3 from "../maps/map-3.ts";

/** The 3 maps players can pick from at room creation (see `PacmanLobby.tsx`),
 * mirrored server-side in `pacman_game/services.py`'s `MAPS` dict — same
 * numbering (1/2/3), same source files, kept in sync by hand (no code
 * sharing possible across TS/Python). `maze` is the CSS theme class
 * (`Game.ts`'s `makeLevel` uses it for wall color + dot sprite color) that
 * would normally come from the solo level-progression table alongside each
 * map; picked here to match since multiplayer doesn't use that table. */
const MAP_BY_CHOICE: Record<number, { rows: string[]; maze: string }> = {
    1: { rows: map1, maze: "maze-1" },
    2: { rows: map2, maze: "maze-2" },
    3: { rows: map3, maze: "maze-3" },
};

/** No-op for the character constructor hooks a remote player never needs. */
const noop = () => {};

/** Boîte de rendu (px) de chaque perso en multi - le défaut du moteur (60,
 * 64 pour un fantôme) déborde dans les coins serrés du labyrinthe. Réduit
 * uniformément ici, jamais dans Game.js/Character.js : la position logique
 * (x,y, collisions) ne dépend pas de cette taille, seul le rendu rétrécit. */
const SPRITE_SIZE = 48;

/** All character sheets (characters.png / characters-plain.png) use a 64px
 * grid pitch regardless of a Character/Ghost subclass's own display-width
 * default (60/64) - `Sprite.spriteScale` needs that true native pitch, not
 * whatever the box happened to default to, or a shrunk box stops lining up
 * with its frame (see `spriteScale`'s doc comment in engine/Sprite.ts). */
const NATIVE_SHEET_CELL = 64;
const SPRITE_SCALE = SPRITE_SIZE / NATIVE_SHEET_CELL;

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
const OPPOSITE_DIR: Record<Direction, Direction> = { l: "r", r: "l", u: "d", d: "u" };

/** Roles rendered as a Pac-Man (get a per-id colour tint). `blocker` is a
 * Pac-Man who can never die (imprisoned instead) and builds anti-ghost walls. */
const PACMAN_ROLES = ["pacman", "madame_pacman", "baby", "blocker"];

/** The only roles allowed to eat the bonus fruit (checked server-side too). */
const FRUIT_EATER_ROLES = ["pacman", "madame_pacman"];

/** The 4 ghost roles - each a distinct, separately selectable character
 * (own colour + original single-player AI target, see makeGhost.ts), not a
 * single generic "ghost" role anymore. */
const GHOST_ROLES = ["ghost_pinky", "ghost_blinky", "ghost_inky", "ghost_sue"];

/** role -> which makeGhost() skin it renders as. */
const GHOST_ROLE_SKIN: Record<string, GhostLabel> = {
    ghost_pinky: "pinky",
    ghost_blinky: "blinky",
    ghost_inky: "inky",
    ghost_sue: "sue",
};

/**
 * Accent visuel par rôle, IDENTIQUE sur tous les clients. Le sprite porte déjà
 * l'essentiel (Ms Pac-Man a son nœud, un fantôme est un fantôme…) ; on ne fait
 * que renforcer, et surtout on ne teinte PLUS par joueur - sinon le Pac-Man
 * adverse vire au vert/bleu chez l'autre et on « n'a pas la même vision ».
 * `blocker` = un Pac-Man constructeur : casque orange lumineux pour le
 * distinguer du Pac-Man classique (même sprite de base).
 */
const ROLE_LOOK: Record<string, string> = {
    pacman: "",
    madame_pacman: "drop-shadow(0 0 3px #ff6ec7)",
    baby: "brightness(1.2) saturate(1.5)",
    blocker: "hue-rotate(28deg) saturate(1.8) drop-shadow(0 0 4px #ff9a00)",
    ghost_pinky: "",
    ghost_blinky: "",
    ghost_inky: "",
    ghost_sue: "",
    builder: "drop-shadow(0 0 4px #38d430)",
};

/** Frightened (power pellet) tint, same for every ghost/Builder on every
 * screen - see `_updateFrightenedTint`/`_updateRemoteFrightenedTints`. */
const FRIGHTENED_FILTER = "brightness(0.7) sepia(1) hue-rotate(200deg) saturate(4)";

/** Halo blanc ajouté au perso local pour repérer « soi » d'un coup d'œil. */
const SELF_GLOW = "drop-shadow(0 0 5px #fff) brightness(1.12)";

export interface MultiplayerGameOptions extends JsPacmanOptions {
    /** Room name. */
    room: string;
    /** WebSocket origin (`ws://host:8000`). */
    serverUrl?: string;
    /** Our role: `pacman` | `madame_pacman` | `baby` | `blocker` | `builder` |
     * `ghost_pinky` | `ghost_blinky` | `ghost_inky` | `ghost_sue` | `spectator`. */
    role?: string;
    /** Display name (from the lobby / account). */
    playerName?: string;
    /** Which of the 3 maps this room uses (1/2/3, from `Game.map_choice`
     * server-side). Defaults to 1. */
    mapChoice?: number;
    /** Skip the splash and start at once (set by the lobby, which already had everyone press "ready"). */
    autoStart?: boolean;
    /** Manche terminée, tout le monde revient au salon d'attente (voir `_restartRound`). */
    onReturnToLobby?: (() => void) | null;
}

/** A remote player's sprite, plus the ad-hoc network-sync fields this file hangs off it. */
type RemoteCharacter = Character & {
    _role?: string;
    _netX?: number;
    _netY?: number;
    _netDir?: Direction | null;
    _lastSeen?: number;
    /** Mirrors `_wasScared`/`_suppressedFrightenedUntil`, but per remote
     * ghost — everyone should see the same frightened tint on someone
     * else's ghost, not just its own controller. */
    _wasScared?: boolean;
    _suppressedFrightenedUntil?: number;
};

interface PositionMsg {
    x?: number;
    y?: number;
}

interface StateSyncSnapshot {
    scores?: Record<string, number>;
    roles?: Record<string, string>;
    frightened_ms?: number;
    lives?: Record<string, number>;
    dots?: [number, number][];
    pellets?: [number, number][];
}

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
    role: string;
    /** Watch-only: no Pac-Man, no avatar, no input, nothing sent. */
    _isSpectator: boolean;
    _localIsPacman: boolean;
    /** Our display name, announced to the room via role metadata. */
    _name: string;
    /** Come from the lobby: leave the splash on our own. */
    _autoStart: boolean;
    /** Which of the 3 maps this room uses — see `MAP_BY_CHOICE`. */
    _mapChoice: number;

    /** Ghost/Builder sprite the local player drives (ghost/builder roles). */
    avatar: GhostClass | null = null;

    /** remote player id -> sprite */
    remotes: Map<string, RemoteCharacter> = new Map();
    /** remote player id -> role */
    _roles: Map<string, string> = new Map();
    /** remote player id -> display name */
    _names: Map<string, string> = new Map();
    _selfId: string | null = null;

    /** Temporary walls dropped by Builder players (shared across the room). */
    walls: WallLayer;
    _lastWallAt = 0;

    net: NetClient;

    /** Authoritative per-player data from the last `state_sync`. */
    _serverScores: Record<string, number> = {};
    _serverRoles: Record<string, string> = {};
    /** Winner of the current round once it ends (null while playing). */
    _resultWinner: string | null = null;
    /** True once we have told the server our round is running. */
    _roundAnnounced = false;

    /** `Date.now()` until which Pac-Man can eat ghosts (0 = not frightened). */
    _frightenedUntil = 0;
    _wasScared = false;
    /**
     * `_frightenedUntil` value (not a boolean — the WINDOW's end timestamp,
     * so a later, unrelated window isn't accidentally suppressed too) at the
     * moment OUR avatar was last sent home. Lets the tint snap back to normal
     * immediately on `ghosthome` instead of staying blue until the frightened
     * timer it interrupted naturally expires.
     */
    _suppressedFrightenedUntil = 0;
    /** Debounce: last time we reported a ghost contact to the server. */
    _lastContactAt = 0;

    _lastPowerAt = 0;
    /** Timestamp until which our Pac-Man is frozen (0 = not frozen). */
    _frozenUntil = 0;
    _wasFrozen = false;
    _speedBeforeFreeze?: number;

    /** Blocker only: timestamp until which our Pac-Man is imprisoned (0 = free). */
    _imprisonedUntil = 0;
    _wasImprisoned = false;
    _speedBeforeImprison?: number;
    /** Debounce: last time our Blocker dropped a wall / walked over one to destroy it. */
    _lastBlockerWallAt = 0;

    /** Baby Pac-Man sprite once born (null otherwise). */
    _baby: PacmanBaby | null = null;
    /** Papa (role `pacman`) has eaten a fruit → a baby can be born. */
    _papaAteFruit = false;

    /** True once a round has ended (all dots eaten, ...). */
    _roundOver = false;
    /** Called once when everyone should leave this round for the lobby
     * "prêt" screen (see `_restartRound`). Debounced by `_returnedToLobby`
     * since a `roundrestart` broadcast can reach us more than once. */
    onReturnToLobby: (() => void) | null;
    _returnedToLobby = false;
    _restartRequested = false;

    _avatarInHouse = false;
    _specBoard: HTMLElement | null = null;
    _resultEl: HTMLElement | null = null;

    /**
     * @param options - {@link JsPacman} options plus room/role/playerName/autoStart/onReturnToLobby.
     */
    constructor(options: MultiplayerGameOptions) {
        super(options);

        this.role = options.role || "pacman";
        this._isSpectator = this.role === "spectator";
        this._localIsPacman = !this._isSpectator && PACMAN_ROLES.indexOf(this.role) !== -1;
        this._name = String(options.playerName || "").slice(0, 20);
        this._autoStart = !!options.autoStart;
        this._mapChoice = MAP_BY_CHOICE[options.mapChoice as number] ? (options.mapChoice as number) : 1;

        this.avatar = null;

        this.remotes = new Map();
        this._roles = new Map();
        this._names = new Map();
        this._selfId = null;

        this.walls = new WallLayer(this);
        this._lastWallAt = 0;

        this.net = new NetClient({ room: options.room, url: options.serverUrl });
        this.net.on("open", () => this._onOpen());
        this.net.on("self", (id) => this._onSelfId(id));
        this.net.on("join", (id) => this._onJoin(id));
        this.net.on("leave", (id) => this._onLeave(id));
        this.net.on("pos", (id, pos, dir) => this._onPos(id, pos, dir));
        this.net.on("role", (id, role, meta) => this._onRole(id, role, meta));
        this.net.on("wall", (id, col, row, ttl, kind) =>
            this.walls.add(col, row, ttl || WALL_TTL_SECONDS, kind === "blocker" ? BLOCKER_WALL_CODE : BUILDER_WALL_CODE),
        );
        this.net.on("walldestroy", (col, row) => this.walls.removeAt(col, row));
        this.net.on("roundover", (id, winner) => this._showRoundResult(winner));
        this.net.on("roundrestart", () => this._restartRound());
        this.net.on("power", (id, kind, x, y) => this._onPower(kind, x, y));
        this.net.on("baby", (id, kind, x, y) => this._onBaby(kind, x, y));
        this.net.on("fruit", (id) => this._onFruitEaten(id));
        this.net.on("doteaten", (col, row, by) => this._onDotEaten(col, row, by));
        this.net.on("sync", (snapshot) => this._onSync(snapshot));
        this.net.on("roundstarted", () => this._onRoundStarted());
        this.net.on("caught", (pid) => this._onPlayerCaught(pid));
        this.net.on("ghosthome", (ghostId) => this._onGhostSentHome(ghostId));
        this.net.on("imprisoned", (pid, seconds) => this._onPlayerImprisoned(pid, seconds));
        this.net.connect();

        this._serverScores = {};
        this._serverRoles = {};
        this._resultWinner = null;
        this._roundAnnounced = false;

        this._frightenedUntil = 0;
        this._wasScared = false;
        this._suppressedFrightenedUntil = 0;
        this._lastContactAt = 0;

        this._lastPowerAt = 0;
        this._frozenUntil = 0;

        this._imprisonedUntil = 0;
        this._wasImprisoned = false;
        this._lastBlockerWallAt = 0;

        this._baby = null;
        this._papaAteFruit = false;

        this._roundOver = false;
        this.onReturnToLobby = options.onReturnToLobby || null;
        this._returnedToLobby = false;

        // `Game.ts`'s own constructor (already run via `super()` above) calls
        // `this.makeLevel()` on line 231 - polymorphism means OUR override
        // ran, but `this._mapChoice` didn't exist yet at that point (can't
        // set instance fields before `super()` returns), so it silently fell
        // back to map 1 regardless of `options.mapChoice`. `reset()` tears
        // down that wrongly-built level (map/pacman/ghosts) and calls
        // `makeLevel()` again - this time with `_mapChoice` actually set -
        // fixing it before anything is ever shown. Must run before the
        // avatar/Pac-Man sprite setup right below, so that setup lands on
        // the correct, final map.
        this.reset();
        // `reset()` -> `makeLevel()` creates a fresh batch of ~224 dot/pill
        // sprites via `addSprite()`. At this point in the constructor the
        // game hasn't reached STATE_RUNNING yet (the async `waitForResources`
        // chain from `super()`'s own `start()` is still mid-flight), so
        // `addSprite()` deliberately skips loading each one individually -
        // it expects a `preload()` sweep to pick them up. But `preload()` is
        // only ever called from `start()`/`resume()`, neither of which runs
        // again after this point, and `reset()`'s `clear()` reset
        // `loadedSpritesIndex` to 0 - so the running `waitForResources` loop
        // keeps checking these dots' `isReady()` forever without anything
        // ever having called `.load()` on them: the loading screen hangs
        // indefinitely (observed as `Animation.isReady()` reading `.complete`
        // on an `img` that's never assigned). Sweep them now, same as the
        // original (never-reset) sprites already got via `super()`'s call.
        this.preload();

        // `reset()` just tore down the wrongly-built map-1 level and rebuilt
        // it via `makeLevel()` - but at this point in the constructor the
        // engine's *original* preload cycle (kicked off by `super()`, via
        // `Game.ts`'s own `this.start()`) is still in flight: `this.state`
        // is still `STATE_NEW`, not yet `STATE_RUNNING`. `engine/Game.ts`'s
        // `addSprite()` only eagerly `.load()`s a sprite when the game is
        // already running - otherwise it assumes the pending bulk `preload()`
        // will pick it up. That assumption breaks here: the ORIGINAL
        // `preload()` call already ran (once, synchronously, over the
        // sprites that existed before this rebuild) and its `waitForResources`
        // retry loop only re-scans `this.sprites`, it never re-`preload()`s.
        // So every sprite this rebuild just created (Pac-Man, all 4 ghosts,
        // every dot/pill, the bonus) sits with an un-loaded `Animation` -
        // `.img` never set - and the next `waitForResources()` tick throws
        // `Cannot read properties of undefined (reading 'complete')` trying
        // to check it, which kills that polling loop for good (uncaught,
        // inside a `setTimeout` callback) and leaves `this.state` stuck at
        // `STATE_NEW` forever. Every state-gated multiplayer path silently
        // stops working from then on - `_onSync`/`_onPos` both bail out on
        // `this.state !== STATE_RUNNING` - so remotes never appear and
        // things like the frightened-ghost tint never reach anyone, with no
        // visible error unless devtools happens to be open. Re-running
        // `preload()` here re-`.load()`s every sprite (redundant but
        // harmless for the ones already loading) and restarts a clean
        // `waitForResources` cycle that will actually reach `STATE_RUNNING`.
        this.preload();

        // Runs every frame, even on the splash screen, independent of mainLoop.
        this.addCallback(() => {
            this._netTick();
        }, this.refreshRate);

        if (this._isSpectator) {
            this._setupSpectator();
        } else if (this._localIsPacman) {
            this._applyLocalPacmanSprite();
            this._resizeLocalPacman();
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
    _localLook(): string {
        return ((ROLE_LOOK[this.role] || "") + " " + SELF_GLOW).trim();
    }

    /**
     * Le moteur de base dessine TOUJOURS notre Pac-Man local avec le sprite
     * Ms Pac-Man (nœud + rouge à lèvres). Pour les rôles `pacman` / `blocker`
     * on bascule sur le même rig SANS rotation (4 vraies directions, comme
     * `_makeRemoteSprite` le fait déjà pour les autres joueurs) mais sans le
     * nœud/rouge à lèvres - juste un échange d'image, aucune géométrie ne
     * change, donc aucun risque de désalignement en tournant.
     * `madame_pacman` garde le sprite d'origine (nœud).
     * @private
     */
    _applyLocalPacmanSprite(): void {
        const pac = this.pacman as Pacman & { _plainLook?: boolean };
        if (!pac || pac._plainLook) return;
        if (this.role !== "pacman" && this.role !== "blocker") return;
        pac._plainLook = true;
        pac.animations = PLAIN_PACMAN_ANIMATIONS;
        pac.load();
        pac.setNextAnimation();
    }

    /**
     * Le Pac-Man local vient du moteur de base à sa taille par défaut (60px) -
     * trop grand pour les coins serrés du labyrinthe (voir {@link SPRITE_SIZE}).
     * `offsetX`/`offsetY` (Item.js) = moitié de la largeur/hauteur et servent à
     * centrer le rendu sur (x,y) : on les recalcule après coup, sinon le
     * sprite resterait décentré avec l'ancien offset.
     * @private
     */
    _resizeLocalPacman(): void {
        const pac = this.pacman;
        if (!pac) return;
        pac.width = SPRITE_SIZE;
        pac.height = SPRITE_SIZE;
        pac.offsetX = SPRITE_SIZE / 2;
        pac.offsetY = SPRITE_SIZE / 2;
        if (pac.el) {
            pac.el.style.width = `${SPRITE_SIZE}px`;
            pac.el.style.height = `${SPRITE_SIZE}px`;
        }
        // Without this, the box above shrinks to 48px but the sheet stays at
        // its native 64px-per-frame resolution (Sprite never touches
        // background-size on its own) - a smaller box with overflow:hidden
        // then just crops the right/bottom of the frame instead of shrinking
        // it (see `spriteScale`'s doc comment in engine/Sprite.ts). Re-apply
        // the current animation so setAnimation() recomputes background-size
        // / background-position for the new scale right away, instead of
        // waiting for the next frame change to (partially) self-correct.
        pac.spriteScale = SPRITE_SCALE;
        if (pac.animation) pac.setAnimation(pac.animation);
    }

    /**
     * Applique {@link _localLook} au corps qu'on pilote (Pac-Man ou avatar).
     * @private
     */
    _styleLocalBody(): void {
        const body = this._localIsPacman ? this.pacman : this.avatar;
        if (body && body.el) body.el.style.filter = this._localLook();
    }

    /**
     * Watch-only mode: park the base Pac-Man, drop the AI ghosts, and show a
     * "SPECTATEUR" banner + a live scoreboard fed by `state_sync`. We never send
     * a position or a `round_start`; everything on screen is other players.
     * @private
     */
    _setupSpectator(): void {
        this.pacman.hide();
        this.pacman._speed = 0;
        this.pacman.speed = 0;
        this.off("game:ghost:eat");
        this.pacman.off("item:life");
        this.pacman.off("item:die");
        this._disarmAiGhosts();
        this._hideAiGhosts();

        // The base score header (1UP / HIGH SCORE) is meaningless watch-only.
        const hud = this.el.querySelector(".score") as HTMLElement | null;
        if (hud) hud.style.visibility = "hidden";

        const box = document.createElement("div");
        Object.assign(box.style, {
            position: "absolute",
            left: "0",
            right: "0",
            top: "0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "5px",
            padding: "10px 6px",
            font: "11px monospace",
            color: "#ffd83d",
            background: "rgba(0,0,0,0.72)",
            zIndex: "45",
            pointerEvents: "none",
            textAlign: "center",
        });
        box.innerHTML =
            '<div style="font-weight:bold;letter-spacing:1px">\u{1F441} MODE SPECTATEUR</div>' +
            '<div class="mp-spec-board" style="color:#fff"></div>';
        this.el.appendChild(box);
        this._specBoard = box.querySelector(".mp-spec-board");
    }

    /**
     * Refresh the spectator scoreboard from the last `state_sync`.
     * @private
     */
    _updateSpectatorBoard(): void {
        if (!this._specBoard) return;
        const rows = this._scoreboardRows();
        this._specBoard.textContent = rows.length
            ? rows.map((r) => `${r.label} ${r.score}`).join("   •   ")
            : "en attente des joueurs…";
    }

    /**
     * Report every dot / pill our Pac-Man eats to the server, which owns the
     * shared dot grid and the score. The base handlers still run locally
     * (sprite removal, sound); the local score stays as a prediction.
     * @private
     */
    _hookPacmanDots(): void {
        const pac = this.pacman as Pacman & { _dotsHooked?: boolean };
        if (!pac || pac._dotsHooked) return;
        pac._dotsHooked = true;
        pac.on("item:eatdot", (tile: Tile) => this.net.sendEatDot(tile.col, tile.row));
        pac.on("item:eatpill", (tile: Tile) => {
            this.net.sendEatDot(tile.col, tile.row);
            // The base engine's own `item:eatpill` handler (registered before
            // this one, during construction) just set `_pauseFrames = 2` — a
            // 2-frame freeze on Pac-Man's own movement, a classic-arcade
            // "chomp" beat that's barely visible solo but reads as a stutter
            // here, since we keep broadcasting position every frame regardless
            // and other players see us stall mid-corridor. Cancel it right
            // back out; nothing else in multiplayer needs this specific pause.
            this._pauseFrames = 0;
        });
    }

    /**
     * Palier 4: real combat is back, but only between *players*. The AI ghosts
     * are decoration in multiplayer - stop them emitting the catch event so
     * they can't kill our Pac-Man, while keeping the `game:ghost:eat` -> death
     * chain intact for a server `player_caught`.
     * @private
     */
    _disarmAiGhosts(): void {
        (["pinky", "blinky", "inky", "sue"] as const).forEach((name) => {
            const ghost = this[name];
            if (ghost) ghost.off("item:eat");
        });
    }

    /**
     * All dots eaten *on this client*. The server owns the shared dot grid and
     * decides when the round is really over, broadcasting `round_over` to
     * everyone. Suppress the base game's local win so a per-client dot miscount
     * can't end the round early.
     */
    win(): void {}

    /**
     * Show the end-of-round banner and stop the game loop.
     * @param winner
     * @private
     */
    _showRoundResult(winner: string): void {
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
    _renderResultBanner(): void {
        if (!this._resultWinner) return;
        if (this._resultEl) {
            this._resultEl.remove();
            this._resultEl = null;
        }

        const banner = document.createElement("div");
        Object.assign(banner.style, {
            position: "absolute",
            left: "0",
            right: "0",
            top: "0",
            bottom: "0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            font: "bold 26px monospace",
            color: "#ffd83d",
            background: "rgba(0, 0, 0, 0.78)",
            textAlign: "center",
            zIndex: 50,
        });

        const title = document.createElement("div");
        title.textContent = this._resultWinner === "pacman" ? "PAC-MAN A GAGNÉ !" : "LES FANTÔMES ONT GAGNÉ !";
        banner.appendChild(title);

        const rows = this._scoreboardRows();
        if (rows.length) {
            const board = document.createElement("div");
            Object.assign(board.style, {
                marginTop: "18px",
                font: "14px monospace",
                color: "#fff",
                lineHeight: "1.6",
            });
            for (const row of rows) {
                const line = document.createElement("div");
                line.textContent = `${row.label} — ${row.score}`;
                if (row.isSelf) line.style.color = "#ffd83d";
                board.appendChild(line);
            }
            banner.appendChild(board);
        }

        const hint = document.createElement("div");
        hint.textContent = "Espace = retour au salon";
        Object.assign(hint.style, { marginTop: "16px", fontSize: "13px", color: "#aaa" });
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
    _scoreboardRows(): { label: string; score: number; isSelf: boolean }[] {
        const ROLE_LABEL: Record<string, string> = {
            pacman: "Pac-Man",
            madame_pacman: "Ms Pac-Man",
            baby: "Bébé",
            blocker: "Blocker",
            ghost: "Fantôme",
            builder: "Builder",
        };
        const scores = this._serverScores || {};
        const roles = this._serverRoles || {};
        return Object.keys(scores)
            .map((pid) => {
                const isSelf = pid === this._selfId;
                const role = isSelf ? this.role : roles[pid] || this._roles.get(pid);
                const name = isSelf ? this._name : this._names.get(pid);
                const label = (name || ROLE_LABEL[role as string] || "Joueur") + (isSelf ? " (toi)" : "");
                return { label: label, score: scores[pid], isSelf: isSelf };
            })
            .sort((a, b) => b.score - a.score);
    }

    /**
     * The room confirms a shared round is live (some client sent `round_start`).
     * Mark it announced so we never send a duplicate - covers a client that
     * joined mid-round and whose local loop reaches play later.
     * @private
     */
    _onRoundStarted(): void {
        this._roundAnnounced = true;
    }

    /**
     * Manche terminée : tout le monde revient au salon d'attente (écran
     * « prêt ») au lieu de rejouer en place sur cette connexion.
     *
     * L'ancien comportement rejouait directement ici (`this.reset()` +
     * `STATUS_PLAY`), mais la manche finie a déjà purgé l'état autoritaire
     * Redis (`_finish_game`) - le `round_restart` reconstruisait alors un
     * salon fantôme sans aucun joueur enregistré côté serveur, désynchronisant
     * tout le monde (scores/contacts silencieusement rejetés). Laisser l'hôte
     * React (`onReturnToLobby`) détruire ce moteur et rouvrir un salon tout
     * neuf réutilise le flux prêt/décompte déjà testé pour le premier lancement.
     *
     * Pas de garde sur `_roundOver` : un client en retard qui n'a pas encore
     * vu le `round_over` doit quand même repartir avec les autres.
     * @private
     */
    _restartRound(): void {
        if (this._returnedToLobby) return;
        this._returnedToLobby = true;
        if (typeof this.onReturnToLobby === "function") this.onReturnToLobby();
    }

    /**
     * Base game loop, plus driving our ghost/Builder avatar when we have one.
     */
    mainLoop(): void {
        if (this._roundOver) return;

        super.mainLoop();

        if (this._isSpectator) {
            // The base intro/respawn code keeps re-showing them - keep watch-only.
            this.pacman.hide();
            this._hideAiGhosts();
            return;
        }

        // Les fantômes IA ne sont pas des joueurs : on les masque en multi pour
        // qu'on ne les confonde pas avec les vrais fantômes pilotés (le moteur
        // de base les ré-affiche à certaines transitions, d'où le hide chaque
        // frame). `_disarmAiGhosts` les a déjà rendus inoffensifs.
        this._hideAiGhosts();

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
    _maybeUseFreeze(): void {
        if (!GHOST_ROLES.includes(this.role) || !this.avatar) return;
        if (!this.keyboard.keys[KEY_ACTION]) return;

        const now = Date.now();
        if (now - this._lastPowerAt < FREEZE_COOLDOWN_MS) return;

        this._lastPowerAt = now;
        this.net.sendPower("freeze", this.avatar.x, this.avatar.y);
    }

    /**
     * A power was used somewhere. Freeze applies to our Pac-Man if it stands
     * within {@link FREEZE_RANGE_PX} of where the ghost triggered it.
     * @private
     */
    _onPower(kind: string, x: number, y: number): void {
        if (kind !== "freeze") return;
        if (!this._localIsPacman || !this.pacman) return;
        if (typeof x !== "number" || typeof y !== "number") return;

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
    _onDotEaten(col: number, row: number, by: string): void {
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
    _onSync(snapshot: StateSyncSnapshot): void {
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
            const serverLives = (snapshot.lives || {})[this._selfId as string];
            if (typeof serverLives === "number" && serverLives > 0 && this.model.lives !== serverLives) {
                this.model.lives = serverLives;
            }
        }

        const live = new Set<string>();
        for (const cell of snapshot.dots || []) live.add(cell[0] + "," + cell[1]);
        for (const cell of snapshot.pellets || []) live.add(cell[0] + "," + cell[1]);

        for (const tile of this.map.tiles) {
            const isItemTile = tile.code === "." || tile.code === "*";
            if (!isItemTile) continue;
            const wanted = live.has(tile.col + "," + tile.row);

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
    _makeItemFor(tile: Tile): void {
        const make = tile.code === "*" ? makePill : makeDot;
        const item = make({
            defaultAnimation: "white",
            map: this.map as any,
            factor: this.scaling.getFactor(),
            normalizeRefreshRate: this.normalizeRefreshRate.bind(this),
            x: tile.x,
            y: tile.y,
        });
        tile.item = item;
        item.load();
        this.addSprite(item);
    }

    /**
     * Hide the 4 AI ghosts only. The base `hideGhosts()` also hides the bonus
     * fruit - called every frame here, it kept the fruit invisible forever, so
     * papa could never see (or aim for) the fruit he needs to have a baby.
     * @private
     */
    _hideAiGhosts(): void {
        this.pinky.hide();
        this.blinky.hide();
        this.inky.hide();
        this.sue.hide();
    }

    // ===================== baby Pac-Man =====================

    /**
     * Wire the current bonus sprite (once): a Pac-Man / Ms Pac-Man announces
     * eating it (and papa gets his "ate a fruit" flag); every other role can't
     * eat it at all - otherwise the parked, hidden base Pac-Man of a ghost
     * client would silently eat it on that screen.
     * @private
     */
    _hookBonus(): void {
        const bonus = this.bonus as (typeof this.bonus & { _netHooked?: boolean }) | null | undefined;
        if (!bonus || bonus._netHooked) return;
        bonus._netHooked = true;

        if (!FRUIT_EATER_ROLES.includes(this.role)) {
            bonus.getPacmanData = () => ({ x: -1, y: -1, tile: null, dir: null });
            return;
        }
        bonus.on("item:eaten", () => {
            if (this._showBonus) return; // Not yet in the maze (same guard as Game.ts)
            this.net.sendFruitEaten();
            if (this.role === "pacman") this._papaAteFruit = true;
        });
    }

    /**
     * Another Pac-Man ate the fruit: end ours the way the eater's screen does
     * (score shown briefly, then gone - see Game.ts's `item:eaten`).
     * @private
     */
    _onFruitEaten(id: string): void {
        const bonus = this.bonus;
        if (id === this._selfId || !bonus || this._destroyBonus) return;
        bonus._eatEvent = true;
        bonus._nextAnimation = bonus.animations[`score${bonus.score}`];
        bonus.update();
        this._destroyBonus = 25;
    }

    /**
     * Papa (role `pacman`) only: if he has eaten a fruit and bumps into a
     * `madame_pacman`, a baby is born and starts heading for a side tunnel.
     * @private
     */
    _checkBabyBirth(): void {
        if (this.role !== "pacman" || !this.pacman || this._baby || !this._papaAteFruit) return;
        if (this.model.status !== STATUS_PLAY) return;

        for (const remote of this.remotes.values()) {
            if (
                remote._role === "madame_pacman" &&
                Math.abs(this.pacman.x - remote.x) < 24 &&
                Math.abs(this.pacman.y - remote.y) < 24
            ) {
                this._spawnBaby(this.pacman.x, this.pacman.y);
                this.net.sendBaby("spawn", this.pacman.x, this.pacman.y);
                return;
            }
        }
    }

    /**
     * Create the baby sprite. The papa's copy runs the AI (walk to the nearest
     * tunnel); every other client just renders it from network position.
     * @private
     */
    _spawnBaby(x: number, y: number): void {
        if (this._baby) return;

        const amPapa = this.role === "pacman";
        this._baby = makePacmanBaby({
            ...this._pacmanAttrs(),
            x: x,
            y: y,
            speed: 60,
            getFollowTarget: amPapa ? () => this._babyTarget() : null,
        } as any);

        // Strip the Pac-Man `item:tile` handler: it eats dots (clearing a path)
        // and, without level speed settings, drops `_speed` to null on a dot,
        // freezing the baby. Keep only the turn animation.
        this._baby.off("item:tile");
        this._baby.on("item:tile", () => this._baby!.setNextAnimation());

        (this._baby as unknown as RemoteCharacter)._netX = x;
        (this._baby as unknown as RemoteCharacter)._netY = y;
        this._baby.el.style.filter = "brightness(1.2) saturate(1.6)";
        this._baby.load();
        this.addSprite(this._baby);
        this._papaAteFruit = false;
    }

    /**
     * Next tile on the shortest path to the nearest side tunnel (the exit),
     * steering clear of the tiles around every ghost-side player. If ghosts
     * cut off every way out, take the shortest path anyway rather than freeze.
     * @private
     * @returns The tile the baby should step onto next.
     */
    _babyTarget(): Tile | null {
        const tunnels = this.map.tunnels;
        if (!tunnels || !tunnels.length || !this._baby) return null;
        const here = this._baby.getTile();
        if (!here) return null;

        const danger = new Set<Tile>();
        for (const remote of this.remotes.values()) {
            if (PACMAN_ROLES.indexOf(remote._role as string) !== -1) continue;
            const t = remote.getTile();
            if (!t) continue;
            danger.add(t);
            for (const d of ["u", "l", "d", "r"]) {
                const n = t.get(d);
                if (n) {
                    danger.add(n);
                    const n2 = n.get(d);
                    if (n2) danger.add(n2);
                }
            }
        }

        return this._babyNextStep(here, danger) || this._babyNextStep(here, new Set()) || tunnels[0];
    }

    /**
     * Breadth-first search from `start` to any tunnel tile, avoiding `danger`.
     * @private
     * @returns First step of the path, or null if no path exists.
     */
    _babyNextStep(start: Tile, danger: Set<Tile>): Tile | null {
        const prev = new Map<Tile, Tile | null>([[start, null]]);
        const queue: Tile[] = [start];
        while (queue.length) {
            const tile = queue.shift()!;
            if (tile !== start && tile.isTunnel()) {
                let step = tile;
                while (prev.get(step) !== start) step = prev.get(step)!;
                return step;
            }
            for (const d of ["u", "l", "d", "r"]) {
                const n = tile.get(d);
                if (!n || prev.has(n) || n.isWall() || n.isHouse() || danger.has(n)) continue;
                prev.set(n, tile);
                queue.push(n);
            }
        }
        return null;
    }

    /**
     * Per-frame baby update. Papa: move it, broadcast, resolve escape / capture.
     * Others: interpolate from the last network position.
     * @private
     */
    _updateBaby(): void {
        if (!this._baby) return;
        this._baby.map = this.map;

        const baby = this._baby as unknown as RemoteCharacter;

        if (this.role !== "pacman") {
            const k = 0.3;
            const dx = (baby._netX ?? this._baby.x) - this._baby.x;
            const dy = (baby._netY ?? this._baby.y) - this._baby.y;
            // Only positions come over the network: face where it's heading,
            // like the papa's copy does.
            const dir: Direction | null = Math.abs(dx) > Math.abs(dy)
                ? (Math.abs(dx) > 1 ? (dx > 0 ? "r" : "l") : null)
                : (Math.abs(dy) > 1 ? (dy > 0 ? "d" : "u") : null);
            if (dir && dir !== this._baby.dir) {
                this._baby.dir = dir;
                this._baby.setNextAnimation();
            }
            this._baby.x += dx * k;
            this._baby.y += dy * k;
            this._baby.update();
            return;
        }

        this._baby.move();
        this.net.sendBaby("move", this._baby.x, this._baby.y);

        const near = (r: RemoteCharacter) => Math.abs(this._baby!.x - r.x) < 22 && Math.abs(this._baby!.y - r.y) < 22;
        for (const remote of this.remotes.values()) {
            if (PACMAN_ROLES.indexOf(remote._role as string) === -1 && near(remote)) {
                this.net.sendBaby("died", this._baby.x, this._baby.y);
                this._babyGone(false);
                return;
            }
        }

        const tile = this._baby.getTile();
        if (tile && tile.isTunnel()) {
            this.net.sendBaby("escape", this._baby.x, this._baby.y);
            this._babyGone(true);
        }
    }

    /**
     * Baby lifecycle event from the papa.
     * @private
     */
    _onBaby(kind: string, x: number, y: number): void {
        if (kind === "spawn") {
            if (!this._baby) this._spawnBaby(x, y);
        } else if (kind === "move") {
            if (this._baby && this.role !== "pacman") {
                const baby = this._baby as unknown as RemoteCharacter;
                baby._netX = x;
                baby._netY = y;
            }
        } else if (kind === "escape") {
            this._babyGone(true);
        } else if (kind === "died") {
            this._babyGone(false);
        }
    }

    /**
     * Remove the baby. If it escaped, our Pac-Man (if we play one) gains a life.
     * @private
     */
    _babyGone(escaped: boolean): void {
        if (!this._baby) return;
        this._baby.destroy();
        this._baby = null;

        if (escaped && this._localIsPacman) {
            this.model.lives++;
            this._flash("+1 VIE");
        }
    }

    /**
     * Brief centred text flash.
     * @private
     */
    _flash(text: string): void {
        const el = document.createElement("div");
        el.textContent = text;
        Object.assign(el.style, {
            position: "absolute",
            left: "0",
            right: "0",
            top: "40%",
            textAlign: "center",
            font: "bold 22px monospace",
            color: "#7CFC00",
            textShadow: "0 0 6px #000",
            zIndex: 40,
            pointerEvents: "none",
        });
        this.el.appendChild(el);
        window.setTimeout(() => el.remove(), 1400);
    }

    /**
     * Scripted one-time slide from the house centre to the corridor just above
     * the door. Ends by handing control back (`_avatarInHouse = false`).
     * @private
     */
    _exitHouse(): void {
        const a = this.avatar!;
        const doorX = this.map.house.getR()!.x - this.map.tileWidth / 2;
        const outY = this.map.house.getU()!.y;
        const speed = 4;

        if (Math.abs(a.x - doorX) > speed) {
            a.dir = a.x < doorX ? "r" : "l";
            a.x += a.dir === "r" ? speed : -speed;
        } else if (a.y > outY + speed) {
            a.x = doorX;
            a.dir = "u";
            a.y -= speed;
        } else {
            a.x = doorX;
            a.y = outY;
            a.dir = "l";
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
    _maybeDropWall(): void {
        if (this.role !== "builder" || !this.avatar) return;
        if (!this.keyboard.keys[KEY_ACTION]) return;

        const now = Date.now();
        if (now - this._lastWallAt < WALL_COOLDOWN_MS) return;

        const here = this.avatar.getTile();
        if (!here) return;

        const back = OPPOSITE_DIR[this.avatar.dir as Direction];
        const target = (back && here.get(back)) || here;
        if (target.isWall() || target.isHouse() || target.isTunnel()) return;

        this._lastWallAt = now;
        this.net.sendWall(target.col, target.row, WALL_TTL_SECONDS, "builder");
    }

    /**
     * Blocker only: space bar drops an anti-ghost wall on the tile just behind
     * our Pac-Man - the mirror image of the Builder's wall, but it blocks
     * ghost/Builder avatars instead of Pac-Men.
     * @private
     */
    _maybeDropBlockerWall(): void {
        if (this.role !== "blocker" || !this.pacman) return;
        if (!this.keyboard.keys[KEY_ACTION]) return;

        const now = Date.now();
        if (now - this._lastBlockerWallAt < WALL_COOLDOWN_MS) return;

        const here = this.pacman.getTile();
        if (!here) return;

        const back = OPPOSITE_DIR[this.pacman.dir as Direction];
        const target = (back && here.get(back)) || here;
        if (target.isWall() || target.isHouse() || target.isTunnel()) return;

        this._lastBlockerWallAt = now;
        this.net.sendWall(target.col, target.row, WALL_TTL_SECONDS, "blocker");
    }

    /**
     * Blocker only: walking onto a Builder wall destroys it, for everyone.
     * Self-limiting - once the wall is gone the tile code changes, so this
     * stops firing until a fresh Builder wall appears underfoot.
     * @private
     */
    _maybeDestroyWall(): void {
        if (this.role !== "blocker" || !this.pacman) return;

        const tile = this.pacman.getTile();
        if (!tile || tile.code !== BUILDER_WALL_CODE) return;

        this.walls.removeAt(tile.col, tile.row);
        this.net.sendWallDestroy(tile.col, tile.row);
    }

    /**
     * Base level setup, plus a fix-up for an engine bug that a normal (short)
     * solo round rarely triggers but a long multiplayer round reliably does.
     */
    makeLevel(): void {
        // Multiplayer never advances `this.model.level` (no per-round level
        // progression like solo), so the base engine would always load
        // level 1's map (map-1). Swap in the room's chosen map for the
        // duration of this one call: `getSettings("game")` reads straight
        // off the level-data table, so the cleanest override without
        // touching `Game.ts`/`GameModel.ts` is to intercept that lookup.
        const chosen = MAP_BY_CHOICE[this._mapChoice] || MAP_BY_CHOICE[1];
        const model = this.model as GameModel & {
            getSettings(key: string): Record<string, unknown>;
        };
        const originalGetSettings = model.getSettings.bind(model);
        model.getSettings = (key: string) => {
            const settings = originalGetSettings(key);
            if (key === "game") {
                settings.map = chosen.rows;
                settings.maze = chosen.maze;
            }
            return settings;
        };
        try {
            super.makeLevel();
        } finally {
            model.getSettings = originalGetSettings;
        }

        // `Bonus.js` fires `item:destroy` with no argument once its fruit has
        // reached the target tile twice, but `Game.js`'s own listener expects
        // that argument (`bonus => { bonus.destroy(); ... }`) - so `bonus` is
        // `undefined` there and `.destroy()` throws. Solo games usually win/lose
        // before the fruit gets that far; our rounds run much longer, so this
        // hits every time. Swap in a version that doesn't need the argument
        // (Game.js/Bonus.js stay untouched).
        if (this.bonus) {
            this.bonus.off("item:destroy");
            this.bonus.on("item:destroy", () => {
                this.bonus!.destroy();
                this.bonus = null;
            });
        }
    }

    /**
     * Rebuild the avatar when the base class rebuilds the level.
     */
    reset(): void {
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
        this._suppressedFrightenedUntil = 0;
        this._lastContactAt = 0;
        this._papaAteFruit = false;
        if (this._baby) {
            this._baby.destroy();
            this._baby = null;
        }
        super.reset();
        if (this._localIsPacman) {
            this._applyLocalPacmanSprite();
            this._resizeLocalPacman();
            this._blockPacmanOnBuilderWalls();
            this._hookPacmanDots();
            this._disarmAiGhosts();
        } else if (!this._isSpectator) {
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
    _blockPacmanOnBuilderWalls(): void {
        const pac = this.pacman as Pacman & { _wallCheckPatched?: boolean };
        if (!pac || pac._wallCheckPatched || this.role === "blocker") return;

        const canGo = pac.canGo.bind(pac);
        pac.canGo = (dir: Direction | null) => {
            if (!canGo(dir)) return false;
            const next = dir ? pac.getTile()!.get(dir) : null;
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
    _blockGhostOnBlockerWalls(): void {
        const avatar = this.avatar as GhostClass & { _wallCheckPatched?: boolean };
        if (!avatar || avatar._wallCheckPatched) return;

        const canGo = avatar.canGo.bind(avatar);
        avatar.canGo = (dir: Direction | null) => {
            if (!canGo(dir)) return false;
            const next = dir ? avatar.getTile()!.get(dir) : null;
            return !next || next.code !== BLOCKER_WALL_CODE;
        };
        avatar._wallCheckPatched = true;
    }

    /**
     * Ghost/Builder players don't steer the base Pac-Man - keep it still.
     * Blocker only: also frozen while imprisoned.
     */
    _getInputDirection(): Direction | null {
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
    _updateFreeze(): void {
        if (!this._localIsPacman || !this.pacman) return;

        const frozen = this._frozenUntil > Date.now();
        if (frozen === this._wasFrozen) return;
        this._wasFrozen = frozen;

        if (frozen) {
            this._speedBeforeFreeze = this.pacman.speed;
            this.pacman.speed = 0;
            this.pacman._speed = 0;
            this.pacman.el.style.filter = "brightness(1.4) hue-rotate(150deg) saturate(2.5)";
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
    _onPlayerImprisoned(pid: string, seconds: number): void {
        if (pid !== this._selfId || !this._localIsPacman) return;
        this._imprisonedUntil = Date.now() + seconds * 1000;
    }

    /**
     * Apply / lift the imprisonment effect on our Blocker each frame (speed 0
     * + a distinct reddish tint while imprisoned).
     * @private
     */
    _updateImprisoned(): void {
        if (!this._localIsPacman || !this.pacman) return;

        const imprisoned = this._imprisonedUntil > Date.now();
        if (imprisoned === this._wasImprisoned) return;
        this._wasImprisoned = imprisoned;

        if (imprisoned) {
            this._speedBeforeImprison = this.pacman.speed;
            this.pacman.speed = 0;
            this.pacman._speed = 0;
            this.pacman.el.style.filter = "sepia(1) hue-rotate(320deg) saturate(3) brightness(0.9)";
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
    _onGhostEat(): void {
        if (this._localIsPacman) super._onGhostEat();
    }

    /**
     * @private
     */
    _onGhostEaten(ghost: GhostClass): void {
        if (this._localIsPacman) super._onGhostEaten(ghost);
    }

    /**
     * Keep the HUD life counter, but never trigger the base GAME OVER screen:
     * in multiplayer the server decides the round is over (ghosts win once
     * every Pac-Man player is out of lives) and broadcasts `round_over`.
     * @private
     */
    _onChangeLives(model: GameModel, lives: number): void {
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
    _checkGhostCatch(): void {
        if (this._roundOver || this.model.status !== STATUS_PLAY) return;
        if (!this._localIsPacman || !this.pacman || this._pacmanEaten) return;
        if (Date.now() - this._lastContactAt < 1200) return;

        const isPacRole = (role?: string) => PACMAN_ROLES.indexOf(role as string) !== -1;
        const near = (r: RemoteCharacter) => Math.abs(this.pacman.x - r.x) < 18 && Math.abs(this.pacman.y - r.y) < 18;

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
    _onPlayerCaught(pid: string): void {
        if (pid !== this._selfId || !this._localIsPacman) return;
        if (this._pacmanEaten || this._roundOver) return;
        this.emit("game:ghost:eat");
    }

    /**
     * Server verdict: a frightened Pac-Man ate the ghost `ghostId`. If that's
     * us, send our avatar back to the house (ghost / Builder role only); the
     * eater's score bump reaches everyone via the next `state_sync`.
     * @private
     */
    _onGhostSentHome(ghostId: string): void {
        if (ghostId === this._selfId) {
            if (this._localIsPacman || !this.avatar) return;
            const hc = this.map.houseCenter;
            this.avatar.x = hc.x;
            this.avatar.y = hc.y;
            this.avatar.dir = null;
            this.avatar._dir = null;
            this.avatar._nextDir = null;
            this._avatarInHouse = true;
            // Snap the tint back to normal right away instead of leaving it
            // blue until `_frightenedUntil` (the window THIS catch happened
            // inside) naturally runs out - `_updateFrightenedTint` would
            // otherwise just see "still frightened" and keep it tinted.
            this._suppressedFrightenedUntil = this._frightenedUntil;
            this._wasScared = false;
            this.avatar.el.style.filter = this._localLook();
            return;
        }

        // Same snap-back for a REMOTE ghost, visible to everyone (not just
        // its own controller) - see `_updateRemoteFrightenedTints`.
        const remote = this.remotes.get(ghostId);
        if (!remote) return;
        remote._suppressedFrightenedUntil = this._frightenedUntil;
        remote._wasScared = false;
        remote.el.style.filter = ROLE_LOOK[remote._role || ""] || "";
    }

    /**
     * Tint our ghost / Builder avatar blue while a power pellet is active, so
     * the player knows they can be eaten. No-op for Pac-Man players.
     * @private
     */
    _updateFrightenedTint(): void {
        if (this._localIsPacman || !this.avatar) return;
        const scared = this._frightenedUntil > Date.now()
            && this._frightenedUntil !== this._suppressedFrightenedUntil;
        if (scared === this._wasScared) return;
        this._wasScared = scared;
        this.avatar.el.style.filter = scared
            ? FRIGHTENED_FILTER
            : this._localLook();
    }

    /**
     * Same tint, applied to every remote ghost/Builder so the frightened
     * state reads the same on everyone's screen - previously only the
     * controlling player's own view turned blue, so nobody else could tell
     * a given ghost was currently eatable.
     * @private
     */
    _updateRemoteFrightenedTints(): void {
        const now = Date.now();
        this.remotes.forEach((remote) => {
            const role = remote._role;
            if (!role || PACMAN_ROLES.indexOf(role) !== -1) return; // pacman-team roles never tint
            const scared = this._frightenedUntil > now
                && this._frightenedUntil !== remote._suppressedFrightenedUntil;
            if (scared === remote._wasScared) return;
            remote._wasScared = scared;
            remote.el.style.filter = scared ? FRIGHTENED_FILTER : (ROLE_LOOK[role] || "");
        });
    }

    /**
     * Per-frame network work: broadcast our position, interpolate the others.
     * @private
     */
    _netTick(): void {
        if (!this.net.connected) return;

        // Came from the lobby: leave the splash on our own once the engine has
        // finished preloading (everyone already pressed "ready" over there).
        if (this._autoStart && this.state === STATE_RUNNING && this.model.status === STATUS_SPLASH) {
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
        this._updateRemoteFrightenedTints();
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
        if (!this._isSpectator && this.model.status === STATUS_PLAY && !this._roundAnnounced) {
            this._roundAnnounced = true;
            this.net.sendRoundStart();
        }

        const body = this._isSpectator ? null : this._localIsPacman ? this.pacman : this.avatar;
        if (body && this.model.status === STATUS_PLAY) {
            this.net.sendPosition(body.x, body.y, body.dir || "l");
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
    _setupLocalAvatar(): void {
        // Called from both the constructor and `reset()` (which the
        // constructor itself runs first): drop the previous avatar, or it
        // stays behind as a frozen extra ghost in the house.
        if (this.avatar) {
            this.avatar.destroy();
            this.avatar = null;
        }
        this.pacman.hide();
        this.pacman._speed = 0;
        this.pacman.speed = 0;

        // The AI ghosts still touch the frozen Pac-Man and would "kill" it,
        // which drops lives and bounces the status back to intro. Cut those
        // event chains - we're not playing a Pac-Man.
        this.off("game:ghost:eat");
        this.pacman.off("item:life");
        this.pacman.off("item:die");

        // Start inside the ghost house, dead centre, like the caged ghosts.
        const hc = this.map.houseCenter;
        this.avatar =
            this.role === "builder"
                ? (makeBuilder({ ...this._ghostAttrs(), x: hc.x, y: hc.y } as any) as unknown as GhostClass)
                : makeGhost(GHOST_ROLE_SKIN[this.role] || "blinky", {
                      ...this._ghostAttrs(),
                      x: hc.x,
                      y: hc.y,
                  } as any);

        // Drop the ghost chase AI: its `item:tile` handler recomputes a path
        // every tile and blows up when we steer it by hand. Keep only the
        // animation-on-turn behaviour.
        this.avatar.off("item:tile");
        this.avatar.on("item:tile", () => this.avatar!.setNextAnimation());
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
     * @returns Direction from the arrow keys.
     */
    _arrowDirection(): Direction | null {
        const keys = this.keyboard.keys;
        if (keys[KEY_UP]) return "u";
        if (keys[KEY_RIGHT]) return "r";
        if (keys[KEY_DOWN]) return "d";
        if (keys[KEY_LEFT]) return "l";
        return null;
    }

    /**
     * (Re)connected: our channel id has changed, so forget who we were and drop
     * every remote - each one comes back from its next position update. This is
     * what recovers cleanly from a server restart or a dropped socket.
     * @private
     */
    _onOpen(): void {
        this._selfId = null;
        this.remotes.forEach((remote) => remote.destroy());
        this.remotes.clear();
        this._roles.clear();
        this.net.sendRole(this.role, { name: this._name });
    }

    /**
     * The server telling us our own id, sent directly right after connecting
     * (see NetClient's `self` event / consumers.py's `self_id` message) -
     * always arrives before any `join` broadcast on this same connection.
     * @private
     */
    _onSelfId(id: string): void {
        this._selfId = id;
    }

    /**
     * Someone joined the room. If it's our own `player_joined` echo, nothing
     * to do (we already know who we are, from `_onSelfId`). Otherwise it's a
     * newcomer who missed our first role announce (the server only relays,
     * it does not replay) - so repeat it.
     *
     * This used to *infer* our own id from "the first `join` we receive" -
     * which raced another player's own `player_joined` echo arriving first
     * (both sockets often open within the same tick, right as a round
     * starts): both clients ended up believing they shared one id, so each
     * either never drew the other player or drew itself as the opponent.
     * @private
     */
    _onJoin(id: string): void {
        if (id === this._selfId) return;
        this.net.sendRole(this.role, { name: this._name });
    }

    /**
     * @private
     */
    _onLeave(id: string): void {
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
    _onPos(id: string, pos: PositionMsg, dir: Direction | null): void {
        if (id === this._selfId) return;
        if (typeof pos.x !== "number" || typeof pos.y !== "number") return;

        let remote = this.remotes.get(id);
        if (!remote) {
            // Adding a sprite before the engine finished its preload would trip
            // its "are all animations ready?" check. Drop updates until then.
            if (this.state !== STATE_RUNNING) return;
            remote = this._addRemote(id, pos as { x: number; y: number });
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
    _onRole(id: string, role: string, meta?: { name?: string }): void {
        if (id === this._selfId) return;
        if (meta && meta.name) this._names.set(id, String(meta.name).slice(0, 20));
        // A spectator has no sprite - drop any we drew for that id and stop.
        if (role === "spectator") {
            this._roles.set(id, "spectator");
            this._onLeave(id);
            return;
        }
        if (this._roles.get(id) === role) return;
        this._roles.set(id, role);

        const existing = this.remotes.get(id);
        if (!existing || existing._role === role) return;

        const pos = { x: existing.x, y: existing.y };
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
     */
    _addRemote(id: string, pos: { x: number; y: number }): RemoteCharacter {
        const role = this._roles.get(id) || "pacman";
        const remote = this._makeRemoteSprite(role, pos);

        remote._role = role;
        remote._netX = pos.x;
        remote._netY = pos.y;
        remote._netDir = null;
        remote._lastSeen = Date.now();

        // Apparence par rôle, la même pour tout le monde (pas de teinte par
        // joueur : un Pac-Man doit rester jaune sur tous les écrans).
        remote.el.style.filter = ROLE_LOOK[role] || "";
        remote.el.style.opacity = "1";

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
    _pacmanAttrs(): Record<string, unknown> {
        return {
            map: this.map,
            factor: this.scaling.getFactor(),
            width: SPRITE_SIZE,
            height: SPRITE_SIZE,
            spriteScale: SPRITE_SCALE,
            normalizeRefreshRate: this.normalizeRefreshRate.bind(this),
            addGameGhostEatEventListener: noop,
            addGameGhostModeFrightenedEnter: noop,
            addGameGhostModeFrightenedExit: noop,
        };
    }

    /**
     * Shared engine wiring for a ghost / Builder character.
     * @private
     */
    _ghostAttrs(): Record<string, unknown> {
        return {
            map: this.map,
            factor: this.scaling.getFactor(),
            width: SPRITE_SIZE,
            height: SPRITE_SIZE,
            spriteScale: SPRITE_SCALE,
            normalizeRefreshRate: this.normalizeRefreshRate.bind(this),
            addGameGlobalModeEventListener: noop,
            addGameGhostEatenEventListener: noop,
            addPacmanEatPillEventListener: noop,
            getPacmanData: () => this.pacman.getPositionData(),
        };
    }

    /**
     * Build the right sprite for a role, network-driven (no input, no AI).
     * @private
     */
    _makeRemoteSprite(role: string, pos: { x: number; y: number }): RemoteCharacter {
        const at = { x: pos.x, y: pos.y };

        if (GHOST_ROLE_SKIN[role]) {
            return makeGhost(GHOST_ROLE_SKIN[role], { ...this._ghostAttrs(), ...at } as any) as unknown as RemoteCharacter;
        }

        switch (role) {
            case "builder":
                return makeBuilder({ ...this._ghostAttrs(), ...at } as any) as unknown as RemoteCharacter;
            case "baby":
                return makePacmanBaby({ ...this._pacmanAttrs(), ...at } as any) as unknown as RemoteCharacter;
            case "madame_pacman":
                return makeMsPacman({ ...this._pacmanAttrs(), ...at } as any) as unknown as RemoteCharacter;
            default:
                // 'pacman' / 'blocker' : même rig que Ms Pac-Man (4 directions,
                // jamais de rotation) mais sans le nœud/rouge à lèvres.
                return makePacmanPlain({ ...this._pacmanAttrs(), ...at } as any) as unknown as RemoteCharacter;
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
    _interpolate(remote: RemoteCharacter): void {
        if (typeof remote._netX !== "number") return;

        remote.map = this.map;

        const k = 0.3;
        const mapW = this.map.width * this.map.tileWidth;
        const mapH = this.map.height * this.map.tileHeight;

        remote.x = this._wrapLerp(remote.x, remote._netX, mapW, k);
        remote.y = this._wrapLerp(remote.y, remote._netY as number, mapH, k);

        if (remote._netDir && remote._netDir !== remote.dir) {
            remote.dir = remote._netDir;
            remote.setNextAnimation();
        }

        remote.update();
        // update() repositionne + (dé)pause l'anim mais n'avance pas la frame ;
        // le main loop du jeu de base le fait pour ses sprites, pas pour les
        // nôtres. Sans ça le chomp reste figé (Pac-Man = rond fermé).
        if (typeof remote.refresh === "function") remote.refresh();
    }

    /**
     * Lerp `from` towards `to` on a wrapping axis of length `size`.
     * @private
     */
    _wrapLerp(from: number, to: number, size: number, k: number): number {
        let delta = to - from;
        if (delta > size / 2) delta -= size;
        else if (delta < -size / 2) delta += size;

        let next = from + delta * k;
        if (next < 0) next += size;
        else if (next > size) next -= size;
        return next;
    }

    /**
     * How many other players we are currently drawing.
     */
    remoteCount(): number {
        return this.remotes.size;
    }

    /**
     * Tear down the socket and every remote sprite.
     */
    onDestroy(): void {
        this.net.disconnect();
        this.remotes.forEach((remote) => remote.destroy());
        this.remotes.clear();
        this.walls.clear();
        if (this.avatar) this.avatar.destroy();
        if (this._baby) this._baby.destroy();
        super.onDestroy();
    }
}

export default MultiplayerGame;
