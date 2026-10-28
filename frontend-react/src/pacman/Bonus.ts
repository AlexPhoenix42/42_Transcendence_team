import Animation from "./engine/Animation.ts";
import Character, { type CharacterOptions, type Direction } from "./Character.ts";
import getDistance from "./helper/getDistance.ts";
import type Tile from "./Tile.ts";

/**
 * Base animation configuration for bonus items.
 */
export const animationBase = {
    imageURL: "img/misc.png",
    offsetY: 0,
    offsetX: 0,
};

/**
 * Animation definitions for different bonus score values.
 */
export const animations: Record<string, Animation> = {
    default: new Animation({
        ...animationBase,
    }),
    score100: new Animation({
        ...animationBase,
        offsetY: 60,
    }),
    score200: new Animation({
        ...animationBase,
        offsetX: 60,
        offsetY: 60,
    }),
    score500: new Animation({
        ...animationBase,
        offsetX: 60 * 2,
        offsetY: 60,
    }),
    score700: new Animation({
        ...animationBase,
        offsetX: 60 * 3,
        offsetY: 60,
    }),
    score1000: new Animation({
        ...animationBase,
        offsetX: 60 * 4,
        offsetY: 60,
    }),
    score2000: new Animation({
        ...animationBase,
        offsetX: 60 * 5,
        offsetY: 60,
    }),
    score5000: new Animation({
        ...animationBase,
        offsetX: 60 * 6,
        offsetY: 60,
    }),
};

export interface BonusOptions extends CharacterOptions {
    score?: string;
    getPacmanData: () => { x: number; y: number; tile: Tile | null; dir: Direction | null };
}

/**
 * Default properties for Bonus instances.
 */
const defaults = {
    animations,
    speed: 40,
    score: "100",
};

/**
 * Bonus item class that moves through the maze and can be eaten by Pacman.
 * Extends Character with bonus-specific behavior.
 * @class Bonus
 * @extends {Character}
 */
class Bonus extends Character {
    // No initializers (see engine/Sprite.ts for why).
    speed!: number;
    score!: string;
    getPacmanData!: () => { x: number; y: number; tile: Tile | null; dir: Direction | null };

    _nextDir: Direction | null = null;
    _eatEvent = false;
    _targetFound = 0;

    /**
     * Creates an instance of Bonus.
     * @param options - Configuration options.
     */
    constructor(options: BonusOptions) {
        super(options);

        // Only touches a key `if (key in options)` - see engine/Sprite.ts for
        // why that (not an unconditional assign) is what makes the fields
        // above's missing initializers actually take effect.
        (Object.keys(defaults) as (keyof typeof defaults)[]).forEach((key) => {
            if (key in options) (this as any)[key] = (options as any)[key];
        });

        this.getPacmanData = options.getPacmanData;

        // Change tile.
        this.on("item:tile", () => {
            this._dir = this._nextDir;
            this._nextDir = this.getNextDirection() ?? null;
            this._eatEvent = false;

            if (this.getTile() === this._getTarget()) {
                if (this._targetFound) {
                    this._targetFound--;
                } else {
                    this.emit("item:destroy", this);
                }
            }
        });

        this._targetFound = 2;
    }

    /**
     * Moves the bonus and checks for collision with Pacman.
     */
    move(): void {
        Character.prototype.move.call(this, this._dir);
        // Eat or eaten!
        if (!this._eatEvent) {
            const pacmanData = this.getPacmanData();
            const pacmanTile = pacmanData.tile,
                tile = this.getTile(),
                opposite = this._getOpDirection(this._dir);
            if (pacmanTile === tile || (pacmanData.dir === opposite && pacmanTile === tile?.get(opposite))) {
                this._eatEvent = true;

                this._nextAnimation = this.animations[`score${this.score}`];
                this.update();

                this.emit("item:eaten", this);
            }
        }
    }

    /**
     * Calculates the next direction for the bonus using pathfinding.
     * @returns The next direction ('u', 'r', 'd', 'l').
     */
    getNextDirection(): Direction | undefined {
        const targetTile = this._getTarget(); // Target Tile

        const _dir = (this._dir || this.dir) as Direction;

        const nextTile = this.getTile()!.get(_dir); // Next tile.

        const directions: Direction[] = ["u", "l", "d", "r"]; // Preferred direction order.

        let nextDirection: Direction | undefined, lastDistance: number | undefined;

        for (let i = 0; i < 4; i++) {
            const dir = directions[i];

            if (dir === this._getOpDirection(_dir)) continue; // Cant't go back.

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
     * Checks if the bonus can move in a given direction.
     * @param dir - The direction to check.
     * @param tile - The tile to check from. Defaults to current tile.
     * @returns True if the bonus can move in that direction.
     */
    canGo(dir: Direction | null, tile?: Tile | null): boolean {
        if (!tile) tile = this.getTile();
        if (!dir) return false;

        const nextTile = tile?.get(dir);

        if (!nextTile) return false;

        return !nextTile.isWall() && !nextTile.isHouse();
    }

    /**
     * Gets the target tile for the bonus (first tunnel).
     * @returns The target tile.
     * @private
     */
    _getTarget(): Tile {
        return this.map.tunnels[0];
    }

    /**
     * Overrides setNextAnimation to do nothing (bonus doesn't change animation).
     */
    setNextAnimation(): void {}
}

Object.assign(Bonus.prototype, defaults);

export default Bonus;
