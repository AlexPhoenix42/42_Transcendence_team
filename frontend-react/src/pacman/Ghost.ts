import Animation, { ANIMATION_HORIZONTAL } from "./engine/Animation.ts";
import Timer from "./engine/Timer.ts";
import Character, { type CharacterOptions, type Direction } from "./Character.ts";
import getDistance from "./helper/getDistance.ts";
import rnd from "./helper/rnd.ts";
import type Tile from "./Tile.ts";

/**
 * Ghost mode: Scatter mode.
 */
export const MODE_SCATTER = "scatter";
/**
 * Ghost mode: Chase mode.
 */
export const MODE_CHASE = "chase";
/**
 * Ghost mode: Frightened mode.
 */
export const MODE_FRIGHTENED = "frightened";
/**
 * Ghost mode: House mode (in ghost house).
 */
export const MODE_HOUSE = "house";
/**
 * Ghost mode: Dead mode (returning to house).
 */
export const MODE_DEAD = "dead";

export type GhostMode =
    | typeof MODE_SCATTER
    | typeof MODE_CHASE
    | typeof MODE_FRIGHTENED
    | typeof MODE_HOUSE
    | typeof MODE_DEAD;

/** Same position/tile bundle every character's `getPositionData()` returns. */
interface PositionData {
    x: number;
    y: number;
    tile: Tile | null;
    dir: Direction | null;
}

/**
 * Base animation configuration for ghosts.
 */
export const animationBase = {
    imageURL: "img/characters.png",
    numberOfFrame: 2,
    delta: 64,
    refreshRate: 180,
    type: ANIMATION_HORIZONTAL,
};

/**
 * Animation definitions for ghosts in different states.
 */
export const animations: Record<string, Animation> = {
    frightened: new Animation({
        ...animationBase,
        offsetY: 376,
        offsetX: -2,
    }),

    frightenedBlink: new Animation({
        ...animationBase,
        offsetY: 376,
        offsetX: -2,
        numberOfFrame: 4,
    }),

    deadRight: new Animation({
        ...animationBase,
        offsetY: 376,
        offsetX: 64 * 4 - 2,
        numberOfFrame: 1,
    }),

    deadDown: new Animation({
        ...animationBase,
        offsetY: 376,
        offsetX: 64 * 5 - 2,
        numberOfFrame: 1,
    }),

    deadUp: new Animation({
        ...animationBase,
        offsetY: 376,
        offsetX: 64 * 6 - 2,
        numberOfFrame: 1,
    }),

    deadLeft: new Animation({
        ...animationBase,
        offsetY: 376,
        offsetX: 64 * 7 - 2,
        numberOfFrame: 1,
    }),

    score200: new Animation({
        ...animationBase,
        imageURL: "img/misc.png",
        numberOfFrame: 1,
        offsetX: -2,
        offsetY: 110,
    }),

    score400: new Animation({
        ...animationBase,
        imageURL: "img/misc.png",
        numberOfFrame: 1,
        offsetX: 64 * 1 - 2,
        offsetY: 110,
    }),

    score800: new Animation({
        ...animationBase,
        imageURL: "img/misc.png",
        numberOfFrame: 1,
        offsetX: 64 * 2 - 2,
        offsetY: 110,
    }),

    score1600: new Animation({
        ...animationBase,
        imageURL: "img/misc.png",
        numberOfFrame: 1,
        offsetX: 64 * 3,
        offsetY: 110,
    }),
};

export interface GhostOptions extends CharacterOptions {
    mode?: GhostMode;
    frightenedTime?: number;
    waitTime?: number;
    /** Tile INDEX (into `map.tiles`) - resolved to the actual `Tile` in the constructor. */
    scatterTarget?: number;
    score?: string | number;
    scores?: Record<string, string>;
    blinky?: Ghost | null;
    getChaseTarget?: (this: Ghost) => Tile | null;
    tunnelSpeed?: number | null;
    frightenedSpeed?: number | null;
    frightenedFlashes?: number | null;
    getPacmanData: () => PositionData;
    addGameGlobalModeEventListener: (listener: (mode: GhostMode) => void) => void;
    addGameGhostEatenEventListener: (listener: () => void) => void;
    addPacmanEatPillEventListener: (listener: () => void) => void;
}

/**
 * Default properties for Ghost instances.
 */
const defaults = {
    animations,
    width: 64,
    speed: 75,
    frightenedTime: 5,
    waitTime: 4,
    score: "200" as string | number,
    scores: { "200": "400", "400": "800", "800": "1600" } as Record<string, string>,
    blinky: null as Ghost | null,
    getChaseTarget: function (this: Ghost): Tile | null {
        return this.getPacmanData().tile;
    },
    tunnelSpeed: null as number | null,
    frightenedSpeed: null as number | null,
    frightenedFlashes: null as number | null,
};

/**
 * Ghost character class. Extends Character with ghost-specific AI and behavior.
 * @class Ghost
 * @extends {Character}
 */
class Ghost extends Character {
    // No initializers (see engine/Sprite.ts for why).
    speed!: number;
    frightenedTime!: number;
    waitTime!: number;
    score!: string | number;
    scores!: Record<string, string>;
    blinky!: Ghost | null;
    getChaseTarget!: () => Tile | null;
    tunnelSpeed!: number | null;
    frightenedSpeed!: number | null;
    frightenedFlashes!: number | null;

    mode: GhostMode = MODE_HOUSE;
    /** Tile index while still an option; resolved to a `Tile` right after `super()`. */
    scatterTarget!: Tile;
    getPacmanData!: () => PositionData;

    deadTarget!: Tile;
    deadEndX!: number;
    deadEndY!: number;
    deadEnd!: Tile | null;
    houseTop!: number;
    houseBottom!: number;
    houseExitTile!: Tile;
    houseExitTileX!: number;

    houseTimer?: Timer | null;
    frightenedTimer?: Timer;
    frightened?: GhostMode | null;
    globalMode?: GhostMode;

    _nextDir: Direction | null = null;
    _turnBack = false;
    _eatEvent = false;
    housePrepareExit = false;
    deadPrepareEnter = false;

    /**
     * Creates an instance of Ghost.
     * @param options - Configuration options.
     */
    constructor(options: GhostOptions) {
        super(options);

        // Only touches a key `if (key in options)` - see engine/Sprite.ts for
        // why that (not an unconditional assign) is what makes the fields
        // above's missing initializers actually take effect.
        (Object.keys(defaults) as (keyof typeof defaults)[]).forEach((key) => {
            if (key in options) (this as any)[key] = (options as any)[key];
        });
        if (options.mode) this.mode = options.mode;

        this.getPacmanData = options.getPacmanData;

        const { addGameGlobalModeEventListener, addGameGhostEatenEventListener, addPacmanEatPillEventListener } =
            options;

        this.deadTarget = this.map.house.getR()!.getU()!;
        this.deadEndX = this._defaults.x as number;
        this.deadEndY = this.map.houseCenter.y;
        this.deadEnd = this.map.getTile(this.deadEndX, this.deadEndY, true);

        this.houseTop = this.y - this.getTile()!.height / 2;
        this.houseBottom = this.y + this.getTile()!.height / 2;
        this.houseExitTile = this.map.house.getR()!;
        this.houseExitTileX = this.houseExitTile.x - this.map.tileWidth / 2;

        this.scatterTarget = this.map.tiles[(options.scatterTarget ?? 0) as unknown as number];

        this.setMode(this.mode);

        // `Character`'s constructor calls `_saveDefaults()` (via `super()`,
        // above) before this subclass constructor has finished setting up
        // `mode` - so `_defaults.mode` was captured as `undefined`, not
        // `MODE_HOUSE`. `reset()` (called after Pacman dies) restores from
        // `_defaults` then does `setMode(this.mode)`; with mode `undefined`
        // that falls through to `mode = this.globalMode` (chase/scatter)
        // instead of `MODE_HOUSE` - so the ghost ends up physically back in
        // the house but in a mode that forbids moving onto house tiles
        // (`canGo()`), leaving it stuck forever. Re-save defaults now that
        // `mode` is actually `MODE_HOUSE`, so `reset()` restores correctly.
        this._saveDefaults();

        // Change tile.
        this.on("item:tile", (t: Tile) => {
            if (this.mode === MODE_FRIGHTENED) this._speed = this.frightenedSpeed as number;
            else if (this.mode === MODE_DEAD) this._speed = 130;
            else if (t.isTunnel()) this._speed = this.tunnelSpeed as number;
            else this._speed = this.speed;

            if (this._turnBack) {
                this.dir = this._getOpDirection(this.dir);
                this._dir = null;
                this._nextDir = this.getNextDirection() ?? null;
                this._turnBack = false;
            } else {
                this._dir = this._nextDir;
                this._nextDir = this.getNextDirection() ?? null;
            }

            this._eatEvent = false;
        });

        addGameGlobalModeEventListener(this.onGameGlobalMode.bind(this));

        addPacmanEatPillEventListener(() => {
            this.setMode(MODE_FRIGHTENED);
            this.score = 200;
        });

        addGameGhostEatenEventListener(() => {
            this.score = this.scores[this.score];
        });
    }

    /**
     * Resets ghost to initial state.
     */
    reset(): void {
        super.reset();
        this.setMode(this.mode);
    }

    /**
     * Pauses ghost timers.
     */
    pause(): void {
        if (this.houseTimer) this.houseTimer.pause();
        if (this.frightenedTimer) this.frightenedTimer.pause();
    }

    /**
     * Resumes ghost timers.
     */
    resume(): void {
        if (this.mode === MODE_FRIGHTENED) this.frightenedTimer!.resume();
        if (this.mode === MODE_HOUSE && !this.housePrepareExit) this.houseTimer!.resume();
    }

    /**
     * Sets the ghost's current mode.
     * @param mode - The mode to set. If not provided, uses global mode.
     */
    setMode(mode?: GhostMode): void {
        if (!mode) {
            if (this.frightened) {
                this.mode = this.frightened;
                this.frightened = null;
                return;
            }

            mode = this.globalMode as GhostMode;
        }

        if (mode === MODE_FRIGHTENED && (this.mode === MODE_HOUSE || this.mode === MODE_DEAD)) {
            this.frightened = mode;
        } else {
            this.mode = mode;
        }

        this.onEnterMode(mode);
    }

    /**
     * Checks if the ghost should exit its current mode.
     * @returns True if the ghost should exit the current mode.
     */
    shouldExitMode(): boolean {
        if (this.mode === MODE_DEAD) return this.getTile() === this.deadEnd;
        else if (this.mode === MODE_FRIGHTENED) return this.frightenedTimer!.isElapsed();
        else if (this.mode === MODE_HOUSE) return this.getTile() === this.houseExitTile.getU();
        else if (this.mode != this.globalMode) return true;

        return false;
    }

    /**
     * Handles actions when entering a new mode.
     * @param mode - The mode being entered.
     */
    onEnterMode(mode: GhostMode): void {
        switch (mode) {
            case MODE_DEAD:
                this.emit("item:modefrightened:exit");
                this.deadPrepareEnter = false;
                this._nextAnimation = this.animations[`score${this.score}`];
                this.update();
                break;
            case MODE_FRIGHTENED:
                this.frightenedTimer = new Timer(this.frightenedTime);
                this.emit("item:modefrightened:enter");
                break;
            case MODE_HOUSE:
                this.housePrepareExit = false;
                this._speed = 70;
                break;
        }
    }

    /**
     * Handles actions when exiting the current mode.
     */
    onExitMode(): void {
        const tile = this.getTile()!;

        switch (this.mode) {
            case MODE_DEAD:
                this.reset();
                break;
            case MODE_FRIGHTENED:
                this.setMode();
                this.emit("item:modefrightened:exit");
                break;
            case MODE_HOUSE:
                this.houseTimer = null;

                this._dir = "l";
                this._nextDir = "l";
                this._lastTile = tile.getD();
                this._speed = this.speed;
                this.setMode();
                break;
            default:
                if (!tile.isHouse()) {
                    this._turnBack = true;
                }
                this.setMode();
                break;
        }
    }

    /**
     * Checks if the ghost is in frightened mode.
     * @returns True if the ghost is frightened.
     */
    isFrightened(): boolean {
        return !!this.frightened || this.mode === MODE_FRIGHTENED;
    }

    /**
     * Checks if the ghost is in dead mode.
     * @returns True if the ghost is dead.
     */
    isDead(): boolean {
        return this.mode === MODE_DEAD;
    }

    /**
     * Handles global game mode changes.
     * @param mode - The new global mode.
     */
    onGameGlobalMode(mode: GhostMode): void {
        if (mode) this.globalMode = mode;
    }

    /**
     * Moves the ghost based on its current mode and AI logic.
     */
    move(): void {
        if (this.shouldExitMode()) {
            this.onExitMode();
        } else {
            if (this.mode === MODE_DEAD) {
                if (!this.deadPrepareEnter && this.getTile() === this.deadTarget) {
                    this.deadPrepareEnter = true;
                }

                if (this.deadPrepareEnter) {
                    let endX = this.deadEndX;
                    const endY = this.deadEndY;
                    // Should go to center first
                    // NB: `map.tw` doesn't exist (pre-existing bug carried over
                    // as-is from the JS - looks like it meant `tileWidth`).
                    if (this.y < endY) endX = this.deadTarget.x - (this.map as any).tw / 2;
                    // Set direction
                    if (this.x < endX) this.dir = "r";
                    else if (this.x > endX) this.dir = "l";
                    else if (this.y < endY) this.dir = "d";
                    // Move
                    if (this.dir === "d") this.y += this.getMin(this.getStep(), endY - this.y);
                    if (this.dir === "r") this.x += this.getMin(this.getStep(), endX - this.x);
                    if (this.dir === "l") this.x -= this.getMin(this.getStep(), this.x - endX);

                    this.setNextAnimation();
                    this.update();
                } else {
                    super.move(this._dir);
                }
            } else if (this.mode === MODE_HOUSE) {
                if (!this.houseTimer) this.houseTimer = new Timer(this.waitTime);

                const tile = this.getTile()!;

                if (!this.housePrepareExit && this.houseTimer.isElapsed() && !tile.isWall()) {
                    this.housePrepareExit = true;
                    this.y = tile.y;
                }

                if (this.frightened && this.frightenedTimer!.isElapsed()) {
                    this.frightened = null;
                }

                if (this.housePrepareExit) {
                    if (this.x < this.houseExitTileX) this.dir = "r";
                    else if (this.x > this.houseExitTileX) this.dir = "l";
                    else this.dir = "u";

                    if (this.dir === "u")
                        this.y -= this.getMin(this.getStep(), this.y - this.houseExitTile.getU()!.y);
                    if (this.dir === "r") this.x += this.getMin(this.getStep(), this.houseExitTileX - this.x);
                    if (this.dir === "l") this.x -= this.getMin(this.getStep(), this.x - this.houseExitTileX);
                } else {
                    if (this.y <= this.houseTop && this.dir === "u") this.dir = "d";
                    if (this.y >= this.houseBottom && this.dir === "d") this.dir = "u";

                    if (this.dir === "u") this.y -= this.getMin(this.getStep(), this.y - this.houseTop);
                    if (this.dir === "d") this.y += this.getMin(this.getStep(), this.houseBottom - this.y);
                }

                this.setNextAnimation();
                this.update();
            } else {
                super.move(this._dir);
            }
        }

        // Eat or eaten!
        if (!this._eatEvent) {
            const pacmanData = this.getPacmanData();
            const pt = pacmanData.tile,
                t = this.getTile(),
                op = this._getOpDirection(this.dir);
            if (pt === t || (pacmanData.dir === op && pt === t?.get(op))) {
                this._eatEvent = true;
                if (this.mode === MODE_FRIGHTENED) {
                    // Ghost eaten by Pacman!
                    this.setMode(MODE_DEAD);
                    this.emit("item:eaten");
                } else if (this.mode !== MODE_DEAD) {
                    // Eat Pacman!
                    this.emit("item:eat");
                }
            }
        }
    }

    /**
     * Checks if the ghost can move in a given direction.
     * @param dir - The direction to check.
     * @param tile - The tile to check from. Defaults to current tile.
     * @returns True if the ghost can move in that direction.
     */
    canGo(dir: Direction | null, tile?: Tile | null): boolean {
        if (!tile) tile = this.getTile();
        if (!dir) return false;

        const nextTile = tile?.get(dir);

        if (this.mode === MODE_DEAD) return !nextTile || !nextTile.isWall();

        if (!nextTile) return false;

        return !nextTile.isWall() && !nextTile.isHouse();
    }

    /**
     * Calculates the next direction for the ghost based on AI logic.
     * @returns The next direction ('u', 'r', 'd', 'l').
     */
    getNextDirection(): Direction | undefined {
        if (this.mode === MODE_FRIGHTENED) {
            // Next tile.
            const nextTile = this.getTile()!.get(this._dir as Direction);
            // Clockwise direction order.
            const directions: Direction[] = ["u", "r", "d", "l", "u", "r", "d", "l"];
            // Select random direction. Then try that direction or change following clockwise order.
            let idx = rnd(4);

            let nextDirection: Direction | undefined = directions[idx];

            while (
                nextDirection &&
                (nextDirection === this._getOpDirection(this._dir) || !this.canGo(nextDirection, nextTile))
            ) {
                nextDirection = directions[++idx];
            }

            return nextDirection;
        }
        // Target Tile
        const targetTile =
            this.mode === MODE_CHASE
                ? this.getChaseTarget()!
                : this.mode === MODE_SCATTER
                  ? this.scatterTarget
                  : this.deadTarget;

        const _dir = (this._dir || this.dir) as Direction;
        // Next tile.
        const nextTile = this.getTile()!.get(_dir);
        // Preferred direction order.
        const directions: Direction[] = ["u", "l", "d", "r"];

        let nextDirection: Direction | undefined, lastDistance: number | undefined;

        for (let i = 0; i < 4; i++) {
            const dir = directions[i];
            // Cant't go back.
            if (dir === this._getOpDirection(_dir)) continue;

            if (this.canGo(dir, nextTile)) {
                const testTile = nextTile!.get(dir);
                const distance = getDistance(testTile!, targetTile);

                if (typeof lastDistance === "undefined" || lastDistance > distance) {
                    nextDirection = dir;
                    lastDistance = distance;
                }
            }
        }

        return nextDirection;
    }

    /**
     * Sets the next animation based on the ghost's current mode and direction.
     */
    setNextAnimation(): void {
        if (this.mode === MODE_DEAD) {
            switch (this.dir) {
                case "u":
                    this._nextAnimation = this.animations.deadUp;
                    break;
                case "r":
                    this._nextAnimation = this.animations.deadRight;
                    break;
                case "d":
                    this._nextAnimation = this.animations.deadDown;
                    break;
                case "l":
                    this._nextAnimation = this.animations.deadLeft;
                    break;
            }
        } else if (this.mode === MODE_FRIGHTENED || (this.mode === MODE_HOUSE && this.frightened)) {
            if (!this.frightenedTimer!.isElapsed(this.frightenedTime * 0.75)) {
                this._nextAnimation = this.animations.frightened;
            } else {
                this._nextAnimation = this.animations.frightenedBlink;
            }
        } else {
            super.setNextAnimation();
        }
    }
}

Object.assign(Ghost.prototype, defaults);

export default Ghost;
