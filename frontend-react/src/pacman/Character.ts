import Item, { type ItemOptions } from "./Item.ts";
import type Animation from "./engine/Animation.ts";
import type Tile from "./Tile.ts";

export type Direction = "u" | "r" | "d" | "l";

export interface CharacterOptions extends ItemOptions {
    width?: number;
    height?: number;
    step?: number;
    speed?: number;
    dir?: Direction | null;
    preturn?: boolean;
}

/**
 * Default properties for Character instances.
 */
const defaults = {
    width: 60,
    height: 60,
    step: 10,
    speed: 80,
    dir: null as Direction | null,
    preturn: false,
};

const animationLabelsByDirections: Record<Direction, string> = {
    l: "left",
    r: "right",
    u: "up",
    d: "down",
};

const oppositeDirections: Record<Direction, Direction> = {
    l: "r",
    r: "l",
    u: "d",
    d: "u",
};

/**
 * Base Character class for game entities that can move.
 * Extends Item with movement and animation capabilities.
 * @class Character
 * @extends {Item}
 */
class Character extends Item {
    // No initializers (see engine/Sprite.ts for why): fall through to
    // `ClassName.prototype.<key>` until a constructor's own forEach sets an
    // own property - e.g. Pacman wants `dir: 'l'`/`preturn: true`, not
    // Character's neutral `null`/`false`.
    width!: number;
    height!: number;
    step!: number;
    speed!: number;
    dir!: Direction | null;
    preturn!: boolean;

    _moving = false;
    _lastX = 0;
    _lastY = 0;
    _speed = 0;
    _dir: Direction | null = null;
    _nextAnimation: Animation | null = null;
    _nextDirection: Direction | null = null;
    _preturn?: boolean;
    _lastTile?: Tile | null;
    _defaults: Record<string, unknown> = {};
    mode?: unknown;

    /**
     * Creates an instance of Character.
     * @param options - Configuration options.
     */
    constructor(options: CharacterOptions) {
        super(options);

        // Only touches a key `if (key in options)` - see engine/Sprite.ts for
        // why that (not an unconditional assign) is what makes the fields
        // above's missing initializers actually take effect.
        (Object.keys(defaults) as (keyof typeof defaults)[]).forEach((key) => {
            if (key in options) (this as any)[key] = (options as any)[key];
        });

        this.pauseAnimation();

        this.on("item:tile", () => {
            this.setNextAnimation();
        });

        this._moving = false;
        this._lastX = this.x;
        this._lastY = this.y;
        this._speed = this.speed;
        this._dir = null;
        this._nextAnimation = null;
        this._nextDirection = null;
        this._moving = false;

        this._saveDefaults();
    }

    /**
     * Saves default values for reset functionality.
     * @private
     */
    _saveDefaults(): void {
        this._defaults = {};

        (
            [
                "x",
                "y",
                "_lastX",
                "_lastY",
                "dir",
                "_dir",
                "_nextAnimation",
                "_nextDirection",
                "_moving",
                "mode",
                "animation",
            ] as const
        ).forEach((key) => {
            this._defaults[key] = (this as any)[key];
        });
    }

    /**
     * Resets the character to its initial state.
     */
    reset(): void {
        Object.assign(this, this._defaults);
        this.transform();
        this.setAnimation(this.animation!);
        this.pauseAnimation();
    }

    /**
     * Updates character position, animation, and emits position events.
     */
    update(): void {
        const tile = this.getTile()!;

        // Fix float point offset.
        if (Math.abs(this.y - tile.y) < 1) this.y = tile.y;
        if (Math.abs(this.x - tile.x) < 1) this.x = tile.x;

        // Position change, move.
        if (this._lastX !== this.x || this._lastY != this.y) {
            this.setXYZ({
                x: this.x,
                y: this.y,
            });

            this._lastX = this.x;
            this._lastY = this.y;

            if (!this._moving) {
                this.emit("item:move");
                this.resumeAnimation();
                this._moving = true;
            }
        } else {
            // Not moving.
            if (this._moving) {
                this.emit("item:stop");
                this.pauseAnimation();
                this._moving = false;
            }
        }
        // Changed animation.
        if (this._nextAnimation && this.animation !== this._nextAnimation) {
            this.setAnimation(this._nextAnimation);
        }
    }
    /**
     * Returns the character's position data.
     * @returns Object containing character's position and tile information.
     */
    getPositionData(): { x: number; y: number; tile: Tile | null; dir: Direction | null } {
        return {
            x: this.x,
            y: this.y,
            tile: this.getTile(),
            dir: this.dir,
        };
    }

    /**
     * Moves the character in the specified direction.
     * Called from Game main loop at every revolution.
     * @param dir - Direction to move. If not provided, uses current direction.
     */
    move(dir?: Direction | null): void {
        if (!dir) dir = this.dir;
        if (!dir) return;

        let tile = this.getTile()!;
        let step = 0;
        const _step = this.getStep();
        // Could go that direction.
        if ((dir != this.dir || this._preturn) && this.canGo(dir)) {
            if ((dir !== this.dir && dir !== this._getOpDirection()) || this._preturn) {
                if (!this._isCentered()) {
                    // Not in the center of the tile. Befor turn, set step so on next frame we get into the center.
                    if (this._isV(dir)) {
                        const diffX = Math.abs(this.x - tile.x);
                        if (this.preturn) {
                            // Set preturn to true to turn faster on corners.
                            if (!this._isCentered("x")) {
                                if (this.x > tile.x) this.x -= this.getMin(diffX, _step);
                                else this.x += this.getMin(diffX, _step);
                                this._preturn = true;
                            } else this._preturn = false;
                        } else {
                            step = this.getMin(diffX, _step);
                        }
                    }
                    if (this._isH(dir)) {
                        const diffY = Math.abs(this.y - tile.y);
                        if (this.preturn) {
                            // Set preturn to true to turn faster on corners.
                            if (!this._isCentered("y")) {
                                if (this.y > tile.y) this.y -= this.getMin(diffY, _step);
                                else this.y += this.getMin(diffY, _step);
                                this._preturn = true;
                            } else this._preturn = false;
                        } else {
                            step = this.getMin(diffY, _step);
                        }
                    }
                }
            }
            // No step. Means change direction.
            if (!step) {
                this.dir = dir;
                this.setNextAnimation();
            }
        }

        if (!step) {
            // Keep straight.
            if (this.canGo(this.dir)) {
                step = _step;
            } else {
                // Wall.
                if (this._isV(this.dir)) {
                    step = this.getMin(Math.abs(this.y - tile.y), _step);
                }
                if (this._isH(this.dir)) {
                    step = this.getMin(Math.abs(this.x - tile.x), _step);
                }
            }
        }
        // Move.
        if (step) {
            if (this.dir === "u") {
                this.y -= step;
            }
            if (this.dir === "r") {
                this.x += step;
            }
            if (this.dir === "d") {
                this.y += step;
            }
            if (this.dir === "l") {
                this.x -= step;
            }
        }
        // Pass away limits.
        if (this.x < 0) this.x = this.map.width * this.map.tileWidth;
        if (this.x > this.map.width * this.map.tileWidth) this.x = 0;
        if (this.y < 0) this.y = this.map.height * this.map.tileHeight;
        if (this.y > this.map.height * this.map.tileHeight) this.y = 0;

        tile = this.getTile()!;

        if (tile !== this._lastTile) {
            this._lastTile = tile;
            this.emit("item:tile", tile);
        }

        this.update();
    }

    /**
     * Calculates the movement step size based on current speed.
     * @returns The step size in pixels.
     */
    getStep(): number {
        return this.step * (this._speed / 100);
    }

    /**
     * Sets the next animation based on current direction.
     * Override in subclasses for custom animation logic.
     */
    setNextAnimation(): void {
        this._nextAnimation = this.animations[animationLabelsByDirections[this.dir as Direction]] ?? null;
    }

    /**
     * Gets the opposite direction.
     * @param dir - Direction to get opposite of. If not provided, uses current direction.
     * @returns The opposite direction.
     * @private
     */
    _getOpDirection(dir?: Direction | null): Direction {
        return oppositeDirections[(dir || this.dir) as Direction];
    }

    /**
     * Checks if the character can move in the specified direction.
     * @param dir - The direction to check ('u', 'r', 'd', 'l').
     * @returns True if the character can move in that direction.
     */
    canGo(dir: Direction | null): boolean {
        const tile = this.getTile()!;

        const nextTile = dir ? tile.get(dir) : null;

        return !!nextTile && !nextTile.isHouse() && !nextTile.isWall();
    }

    /**
     * Checks if direction is vertical (up or down).
     * @param dir - The direction to check.
     * @returns True if direction is vertical.
     * @private
     */
    _isV(dir: Direction | null): boolean {
        return dir === "u" || dir === "d";
    }

    /**
     * Checks if direction is horizontal (left or right).
     * @param dir - The direction to check.
     * @returns True if direction is horizontal.
     * @private
     */
    _isH(dir: Direction | null): boolean {
        return dir === "l" || dir === "r";
    }

    /**
     * Checks if the character is centered on the current tile.
     * @param xy - 'x' or 'y' to check specific axis, or undefined for both.
     * @returns True if centered.
     * @private
     */
    _isCentered(xy?: "x" | "y"): boolean {
        const tile = this.getTile()!;
        const x = tile.x === this.x,
            y = tile.y === this.y;

        if (xy === "x") return x;
        if (xy === "y") return y;
        else return x && y;
    }

    /**
     * Gets the minimum value from the provided arguments.
     * @returns The minimum value.
     */
    getMin(...values: number[]): number {
        let min: number | null = null;
        for (let i = 0, l = values.length; i < l; i++) if (min === null || values[i] < min) min = values[i];

        return min as number;
    }
}

Object.assign(Character.prototype, defaults);

export default Character;
