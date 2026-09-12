import View from "rasti/View.js";

import Keyboard from "./Keyboard.ts";
import Touch from "./Touch.ts";
import GamepadInput from "./Gamepad.ts";
import Scaling from "./Scaling.ts";
import type Sprite from "./Sprite.ts";
import type Sound from "./Sound.ts";

/**
 * Game state: New game, not yet started.
 */
export const STATE_NEW = 0;
/**
 * Game state: Game is currently running.
 */
export const STATE_RUNNING = 1;
/**
 * Game state: Game is paused.
 */
export const STATE_PAUSED = 2;

export interface GameOptions {
    height?: number;
    width?: number;
    originalHeight?: number;
    originalWidth?: number;
    refreshRate?: number;
    position?: string;
    [key: string]: unknown;
}

interface GameCallback {
    fn: () => boolean | number | void;
    refreshRate: number;
    idleCounter: number;
}

/**
 * Default properties for Game instances.
 */
const defaults = {
    height: 320,
    width: 480,
    originalHeight: 320,
    originalWidth: 480,
    refreshRate: 30,
    position: "absolute",
};

/**
 * Main Game engine class that manages sprites, sounds, callbacks, and game loop.
 * Extends View from rasti framework.
 * @class Game
 * @extends {View}
 */
class Game extends View {
    // No initializer on purpose (see engine/Sprite.ts for the full why): this
    // constructor builds `this.scaling` from `originalWidth`/`originalHeight`
    // *before* a subclass's own constructor body (its `defaults` forEach) can
    // override them - e.g. JsPacman wants 896x1152, not this class's 480x320.
    // A field initializer here would create an own property with THIS class's
    // value before that override runs, and `Scaling` would bake in the wrong
    // aspect ratio permanently. Leaving these undeclared falls through to
    // `Game.prototype.<key>` (set by `Object.assign(prototype, defaults)`
    // below) only when nothing further down the chain sets it first - the
    // same prototype-cascade the old JS relied on.
    height!: number;
    width!: number;
    originalHeight!: number;
    originalWidth!: number;
    refreshRate!: number;
    position!: string;

    sprites: Sprite[];
    sounds: Sound[] = [];
    callbacks: GameCallback[] = [];
    loadedSpritesIndex = 0;
    loadedSoundsIndex = 0;

    keyboard: Keyboard;
    touch: Touch;
    gamepad: GamepadInput;
    scaling: Scaling;
    state: number;

    scenegraph!: HTMLElement;
    // Not declared as a field on purpose: JsPacman overrides it as a METHOD
    // (`onLoadProgress(percent) {...}`), and TS refuses a method overriding a
    // property of the same name in a base class. It's genuinely optional
    // (checked with `typeof ... === 'function'` below), so it just falls
    // through View's index signature instead.
    private _onReadyCallback?: (() => void) | null;

    /**
     * Creates an instance of Game.
     * @param options - Configuration options for the game.
     */
    constructor(options: GameOptions) {
        super(options);

        // Only touches a key `if (key in options)` - see engine/Sprite.ts for
        // why that (not an unconditional assign) is what makes the fields
        // above's missing initializers actually take effect.
        (Object.keys(defaults) as (keyof typeof defaults)[]).forEach((key) => {
            if (key in options) (this as any)[key] = (options as any)[key];
        });

        this.sprites = this.children as unknown as Sprite[]; // List of sprites with animations / images used in the game
        this.sounds = []; // List of sounds used in the game
        this.callbacks = []; // List of the functions called at each refresh
        this.loadedSpritesIndex = 0; // Keep track of the last loaded animation
        this.loadedSoundsIndex = 0; // Keep track of the last loaded sound

        this.keyboard = new Keyboard();
        this.touch = new Touch();
        this.gamepad = new GamepadInput();

        this.scaling = new Scaling(this.originalWidth, this.originalHeight);
        this.scaling.resize(this.width, this.height);

        this.state = STATE_NEW;
    }

    /**
     * Renders the game container and sets up the scenegraph.
     * @returns Returns this instance for method chaining.
     */
    render(): this {
        // We initialize the display of the div
        Object.assign(this.el.style, {
            position: this.position,
            display: "block",
            overflow: "hidden",
            height: `${this.scaling.height}px`,
            width: `${this.scaling.width}px`,
            fontSize: `${this.scaling.getFactor() * 2}em`,
        });

        this.scenegraph = this.createElement("div", {
            style: "visibility: hidden;",
        });

        this.el.appendChild(this.scenegraph);

        return this;
    }

    /**
     * Cleanup method called when the game is destroyed.
     * Removes keyboard, touch, and gamepad event listeners.
     */
    onDestroy(): void {
        this.keyboard.destroy();
        this.touch.destroy();
        this.gamepad.destroy();
    }

    /**
     * Load resources before starting the game.
     */
    preload(): void {
        // Start loading the images
        for (let i = this.sprites.length - 1; i >= this.loadedSpritesIndex; i--) {
            this.sprites[i].load();
        }

        // Start loading the sounds
        for (let i = this.sounds.length - 1; i >= this.loadedSoundsIndex; i--) {
            this.sounds[i].load();
        }

        this.waitForResources();
    }

    /**
     * Wait for all the resources called for in preload() to finish loading.
     */
    waitForResources(): void {
        // Check the images
        let spriteCount = 0;
        for (let i = this.loadedSpritesIndex; i < this.sprites.length; i++) {
            if (this.sprites[i].isReady()) {
                spriteCount++;
            }
        }
        // Check the sounds
        let soundCount = 0;
        for (let i = this.loadedSoundsIndex; i < this.sounds.length; i++) {
            if (this.sounds[i].isReady()) {
                soundCount++;
            }
        }

        const rest = this.sprites.length + this.sounds.length - this.loadedSpritesIndex - this.loadedSoundsIndex;

        // Call the load callback with the current progress
        if (typeof this.onLoadProgress === "function") {
            const percent = ((spriteCount + soundCount) / rest) * 100;
            this.onLoadProgress(percent);
        }

        if (spriteCount + soundCount < rest) {
            setTimeout(this.waitForResources.bind(this), 100);
        } else {
            this.loadedSpritesIndex = this.sprites.length;
            this.loadedSoundsIndex = this.sounds.length;

            // Launch the refresh loop
            if (this.state === STATE_NEW) {
                setInterval(this.refresh.bind(this), this.refreshRate);
            }

            this.state = STATE_RUNNING;

            if (typeof this._onReadyCallback === "function") {
                this._onReadyCallback();
                this._onReadyCallback = null;
            }
            // Make the scenegraph visible
            this.scenegraph.style.visibility = "visible";
        }
    }
    /**
     * Adds a sprite to the game scenegraph.
     * @param sprite - The sprite instance to add.
     * @returns Promise that resolves when the sprite is loaded (if game is running).
     */
    addSprite(sprite: Sprite): Promise<void> {
        this.scenegraph.appendChild(this.addChild(sprite as unknown as View).el);

        return this.state === STATE_RUNNING
            ? sprite.load().then(() => {
                  this.loadedSpritesIndex++;
                  return Promise.resolve();
              })
            : Promise.resolve();
    }
    /**
     * Adds a sound to the game's sound collection.
     * @param sound - The sound instance to add.
     * @returns Promise that resolves when the sound is loaded (if game is running).
     */
    addSound(sound: Sound): Promise<void> {
        this.sounds.push(sound);
        return this.state === STATE_RUNNING
            ? sound.load().then(() => {
                  this.loadedSoundsIndex++;
                  return Promise.resolve();
              })
            : Promise.resolve();
    }
    /**
     * Registers a callback function to be called during the game loop.
     * @param callback - The callback function to execute.
     * @param refreshRate - The rate in ms at which the callback should be called (should be a multiple of the game refresh rate or will be rounded).
     */
    addCallback(callback: () => boolean | number | void, refreshRate: number = this.refreshRate): void {
        this.callbacks.push({ fn: callback, refreshRate: this.normalizeRefreshRate(refreshRate), idleCounter: 0 });
    }
    /**
     * Called periodically to refresh the state of the game.
     */
    refresh(): void {
        this.gamepad.refresh();
        if (this.state === STATE_RUNNING) {
            this.sprites.forEach((sprite) => {
                sprite.refresh();
            });

            const deadCallbacks: number[] = [];
            for (let i = this.callbacks.length - 1; i >= 0; i--) {
                if (this.callbacks[i].idleCounter === this.callbacks[i].refreshRate - 1) {
                    const value = this.callbacks[i].fn();
                    if (typeof value === "boolean") {
                        // If we have a boolean: 'true' means 'no more execution', 'false' means 'keep on executing'
                        if (value) {
                            deadCallbacks.push(i);
                        }
                    } else if (typeof value === "number") {
                        // If we have a number it re-defines the time to the next call
                        this.callbacks[i].refreshRate = this.normalizeRefreshRate(value);
                        this.callbacks[i].idleCounter = 0;
                    }
                }
                this.callbacks[i].idleCounter = (this.callbacks[i].idleCounter + 1) % this.callbacks[i].refreshRate;
            }

            for (let i = deadCallbacks.length - 1; i >= 0; i--) {
                this.callbacks.splice(deadCallbacks[i], 1);
            }
        }
    }
    /**
     * Clears all sprites, sounds, and optionally callbacks from the game.
     * @param clearCallbacks - If true, also clears all registered callbacks.
     */
    clear(clearCallbacks?: boolean): void {
        this.destroyChildren();
        this.loadedSpritesIndex = 0;
        this.sounds = [];
        this.loadedSoundsIndex = 0;
        if (clearCallbacks) {
            this.callbacks = [];
        }
        this.scenegraph.innerHTML = "";
    }
    /**
     * Mutes or unmutes all sounds in the game.
     * @param muted - If true, mutes all sounds; if false, unmutes them.
     */
    muteSound(muted: boolean): void {
        for (let i = this.sounds.length - 1; i >= 0; i--) {
            this.sounds[i].mute(muted);
        }
    }
    /**
     * Starts the game by initiating resource loading and game loop.
     * @param callback - Optional callback function to execute when the game is ready.
     */
    start(callback?: () => void): void {
        if (typeof callback === "function") this._onReadyCallback = callback;
        this.preload();
    }
    /**
     * Pauses the game by changing state and hiding the scenegraph.
     */
    pause(): void {
        this.state = STATE_PAUSED;
        this.scenegraph.style.visibility = "hidden";
    }
    /**
     * Resumes the game if it was paused and calls the callback once newly added resources are loaded.
     * @param callback - Optional callback function to execute when the game is ready.
     */
    resume(callback?: () => void): void {
        if (this.state === STATE_PAUSED) {
            if (typeof callback === "function") this._onReadyCallback = callback;
            this.preload();
        }
    }

    /**
     * Normalizes a refresh rate to be a multiple of the game's base refresh rate.
     * @param rate - The refresh rate in milliseconds to normalize.
     * @returns The normalized refresh rate (rounded to nearest multiple of game refresh rate).
     */
    normalizeRefreshRate(rate: number): number {
        return Math.round(rate / this.refreshRate) || 1;
    }
}

Object.assign(Game.prototype, defaults);

export default Game;
