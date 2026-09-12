import View from "rasti/View.js";
import { assetURL } from "../assetBase.ts";

import Animation, {
    ANIMATION_HORIZONTAL,
    ANIMATION_VERTICAL,
    ANIMATION_ONCE,
    ANIMATION_CALLBACK,
    ANIMATION_PINGPONG,
} from "./Animation.ts";

export interface SpriteOptions {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    z?: number;
    offsetX?: number;
    offsetY?: number;
    angle?: number;
    factor?: number;
    factorH?: number;
    factorV?: number;
    animations?: Record<string, Animation>;
    defaultAnimation?: string;
    normalizeRefreshRate?: (rate: number) => number;
    type?: string | null;
    [key: string]: unknown;
}

/**
 * Default properties for Sprite instances.
 */
const defaults = {
    width: 32,
    height: 32,
    x: 0,
    y: 0,
    z: 0,
    offsetX: 0,
    offsetY: 0,
    idleCounter: 0,
    currentFrame: 0,
    frameIncrement: 1,
    angle: 0,
    factor: 1,
    playing: true,
    factorH: 1,
    factorV: 1,
    animations: {} as Record<string, Animation>,
    defaultAnimation: "default",
    normalizeRefreshRate: null as ((rate: number) => number) | null,
    type: null as string | null,
};

/**
 * Sprite class for rendering animated sprites on the canvas.
 * Extends View from rasti framework.
 * @class Sprite
 * @extends {View}
 */
class Sprite extends View {
    // No initializers on purpose (full explanation below, at the constructor's
    // forEach): `Item`'s constructor calls `this.render()` - which reads
    // `this.animations`/`this.defaultAnimation` - *before* a more-derived
    // class's own constructor body (e.g. Pacman's) has set its real values.
    // A field initializer here would create an own `{}` at that point,
    // permanently shadowing `ClassName.prototype.animations` (the real
    // per-character set, from that class's own `Object.assign(prototype,
    // defaults)`) - which is exactly what the old JS relied on to make
    // `render()` see the right animations even that early. Leaving these
    // undeclared restores that prototype fallback.
    width!: number;
    height!: number;
    x!: number;
    y!: number;
    z!: number;
    offsetX!: number;
    offsetY!: number;
    idleCounter!: number;
    currentFrame!: number;
    frameIncrement!: number;
    angle!: number;
    factor!: number;
    playing!: boolean;
    factorH!: number;
    factorV!: number;
    animations!: Record<string, Animation>;
    defaultAnimation!: string;
    normalizeRefreshRate!: ((rate: number) => number) | null;
    type!: string | null;

    animation?: Animation;
    // Deliberately `Sprite`, not the polymorphic `this`: a `this`-typed callback
    // makes every subclass's `callback` field incompatible with `Sprite`'s,
    // which then makes the subclass itself unassignable wherever a plain
    // `Sprite` is expected (`addSprite`, `addChild`, ...) - a real trap here,
    // not a hypothetical one (it broke `Game.addSprite(this.pacman)` et al.).
    callback?: ((sprite: Sprite) => void) | null;

    /**
     * Creates an instance of Sprite.
     * @param options - Configuration options for the sprite.
     */
    constructor(options: SpriteOptions) {
        super(options);

        // A key is only ever touched here `if (key in options)` - left alone
        // otherwise, so it falls through to `ClassName.prototype.<key>` (set
        // by `Object.assign(prototype, defaults)` below the class). That
        // fallback is how a subclass's own defaults (e.g. Pacman's real
        // `animations`) take effect for instances that never pass that key in
        // `options` (Lives.ts's mini Pac-Men, for one) - and it only works
        // because the fields above have NO initializer: an initializer would
        // run first and set an own `{}`/`"default"` here that permanently
        // shadows the prototype, before a subclass constructor further down
        // the `super()` chain ever gets a say.
        (Object.keys(defaults) as (keyof typeof defaults)[]).forEach((key) => {
            if (key in options) (this as any)[key] = (options as any)[key];
        });
    }

    /**
     * Loads all animations associated with this sprite.
     * @returns Promise that resolves when all animations are loaded.
     */
    load(): Promise<void[]> {
        return Promise.all(
            Object.keys(this.animations).map((label) => this.animations[label].load()),
        );
    }

    /**
     * Checks if at least one animation is ready to be displayed.
     * @returns True if at least one animation is ready, false otherwise.
     */
    isReady(): boolean {
        return Object.keys(this.animations).some((label) => !!this.animations[label].isReady());
    }

    /**
     * Renders the sprite element and sets up initial styling and animation.
     * @returns Returns this instance for method chaining.
     */
    render(): this {
        Object.assign(this.el.style, {
            position: "absolute",
            overflow: "hidden",
            height: `${this.height}px`,
            width: `${this.width}px`,
            zIndex: this.z,
        });

        if (this.animations[this.defaultAnimation]) this.setAnimation(this.animations[this.defaultAnimation]);

        this.transform();

        return this;
    }

    /**
     * Refreshes the sprite animation frame based on the current animation state.
     * Handles frame progression, callbacks, and background position updates.
     */
    refresh(): void {
        if (!this.animation) return;

        const normalize = this.normalizeRefreshRate!;

        if (this.idleCounter === normalize(this.animation.refreshRate) - 1 && this.playing) {
            // Does 'this' loops?
            if (this.animation.type & ANIMATION_ONCE) {
                if (this.currentFrame < this.animation.numberOfFrame - 1) {
                    this.currentFrame += this.frameIncrement;
                } else if (this.currentFrame == this.animation.numberOfFrame - 1) {
                    // Does 'this' has a callback ?
                    if (this.animation.type & ANIMATION_CALLBACK) {
                        if (typeof this.callback === "function") {
                            this.callback(this);
                            this.callback = null;
                        }
                    }
                }
            } else {
                if (this.animation.type & ANIMATION_PINGPONG) {
                    if (this.currentFrame === this.animation.numberOfFrame - 1 && this.frameIncrement === 1) {
                        this.frameIncrement = -1;
                    } else if (this.currentFrame === 0 && this.frameIncrement === -1) {
                        this.frameIncrement = 1;
                    }
                }

                this.currentFrame = (this.currentFrame + this.frameIncrement) % this.animation.numberOfFrame;

                if (this.currentFrame === 0) {
                    // Does 'this' has a callback ?
                    if (this.animation.type & ANIMATION_CALLBACK) {
                        if (typeof this.callback === "function") {
                            this.callback(this);
                        }
                    }
                }
            }
            // Update the background
            if (this.animation.numberOfFrame > 1) {
                let x = 0,
                    y = 0;

                if (this.animation.type & ANIMATION_VERTICAL) {
                    x = -this.animation.offsetX;
                    y = -this.animation.offsetY - this.animation.delta * this.currentFrame;
                } else if (this.animation.type & ANIMATION_HORIZONTAL) {
                    x = -this.animation.offsetX - this.animation.delta * this.currentFrame;
                    y = -this.animation.offsetY;
                }

                this.el.style.backgroundPosition = `${x}px ${y}px`;
            }
        }
        this.idleCounter = (this.idleCounter + 1) % normalize(this.animation.refreshRate);
    }
    /**
     * Stop the animation at the current frame.
     */
    pauseAnimation(): void {
        this.playing = false;
    }
    /**
     * Resume the animation (if paused)
     */
    resumeAnimation(): void {
        this.playing = true;
    }
    /**
     * Changes the animation associated with a sprite.
     * @param animation - The animation object to set.
     * @param index - Optional frame index (currently unused).
     * @param callback - Optional callback function to execute when animation completes.
     */
    setAnimation(animation: Animation, index?: number, callback?: (sprite: Sprite) => void): void {
        this.animation = animation;

        this.currentFrame = 0;
        this.frameIncrement = 1;

        this.el.style.backgroundImage = `url('${assetURL(animation.imageURL)}')`;

        if (animation.type & ANIMATION_VERTICAL) {
            this.el.style.backgroundRepeat = "repeat-x";
        } else if (animation.type & ANIMATION_HORIZONTAL) {
            this.el.style.backgroundRepeat = "repeat-y";
        } else {
            this.el.style.backgroundRepeat = "no-repeat";
        }

        const distanceX = 0;
        const distanceY = 0;

        this.el.style.backgroundPosition = `${-distanceX - animation.offsetX}px ${-distanceY - animation.offsetY}px`;

        if (typeof callback === "function") {
            this.callback = callback;
        }
    }
    /**
     * Internal function doing the combined actions of rotate and scale.
     * Please use .rotate() or .scale() instead since they are part of the supported API!
     */
    transform(): void {
        this.el.style.transform = `translate(${this.x * this.factor - this.offsetX}px, ${this.y * this.factor - this.offsetY}px) rotate(${this.angle}deg) scale(${this.factor * this.factorH}, ${this.factor * this.factorV})`;
    }
    /**
     * Rotate the element(s) clock-wise.
     * @param angle - the angle in degrees
     * @param relative - or not
     */
    rotate(angle: number, relative?: boolean): void {
        if (relative === true) {
            angle += this.angle;
            angle %= 360;
        }

        this.angle = angle;
        this.transform();
    }
    /**
     * Change the scale of the selected element(s). The passed argument is a ratio:
     * @param factor - a ratio: 1.0 = original size, 0.5 = half the original size etc.
     * @param relative - or not
     */
    scale(factor: number, relative?: boolean): void {
        if (relative === true) {
            factor *= this.factor;
        }
        this.factor = factor;
        this.transform();
    }
    /**
     * Flips the element(s) horizontally.
     */
    flipH(flip?: boolean): boolean | void {
        if (flip === undefined) {
            return this.factorH !== undefined ? this.factorH === -1 : false;
        } else if (flip) {
            this.factorH = -1;
        } else {
            this.factorH = 1;
        }

        this.transform();
    }
    /**
     * Flips the element(s) vertically.
     */
    flipV(flip?: boolean): boolean | void {
        if (flip === undefined) {
            return this.factorV !== undefined ? this.factorV === -1 : false;
        } else if (flip) {
            this.factorV = -1;
        } else {
            this.factorV = 1;
        }

        this.transform();
    }

    /**
     * Sets the X, Y, and/or Z coordinates of the sprite.
     * @param options - Object containing x, y, and/or z coordinates.
     * @param relative - If true, adds to current position; if false, sets absolute position.
     */
    setXYZ(options: { x?: number; y?: number; z?: number }, relative?: boolean): void {
        let transform = false;

        (Object.keys(options) as (keyof typeof options)[]).forEach((coordinate) => {
            switch (coordinate) {
                case "x":
                    if (relative) {
                        options.x = (options.x ?? 0) + this.x;
                    }
                    this.x = options.x as number;
                    transform = true;
                    break;

                case "y":
                    if (relative) {
                        options.y = (options.y ?? 0) + this.y;
                    }
                    this.y = options.y as number;
                    transform = true;
                    break;

                case "z":
                    if (relative) {
                        options.z = (options.z ?? 0) + this.z;
                    }
                    this.z = options.z as number;
                    this.el.style.zIndex = String(this.z);
                    break;
            }
        });

        if (transform) this.transform();
    }

    /**
     * Sets the width and/or height of the sprite.
     * @param options - Object containing w (width) and/or h (height) values.
     * @param relative - If true, adds to current dimensions; if false, sets absolute dimensions.
     */
    setWH(options: { w?: number; h?: number }, relative?: boolean): void {
        (Object.keys(options) as (keyof typeof options)[]).forEach((coordinate) => {
            switch (coordinate) {
                case "w":
                    if (relative) {
                        options.w = (options.w ?? 0) + this.width;
                    }
                    this.width = options.w as number;
                    this.el.style.width = `${this.width}px`;
                    break;

                case "h":
                    if (relative) {
                        options.h = (options.h ?? 0) + this.height;
                    }
                    this.height = options.h as number;
                    this.el.style.height = `${this.height}px`;
                    break;
            }
        });
    }
}

Object.assign(Sprite.prototype, defaults);

export default Sprite;
