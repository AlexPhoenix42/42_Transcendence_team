import Animation, { ANIMATION_HORIZONTAL } from "./engine/Animation.ts";
import Character, { type CharacterOptions, type Direction } from "./Character.ts";
import type Tile from "./Tile.ts";

/**
 * Base animation configuration for Pacman.
 */
const animationBase = {
    imageURL: "img/characters.png",
    numberOfFrame: 4,
    delta: 64,
    refreshRate: 60,
    offsetY: 60,
    type: ANIMATION_HORIZONTAL,
};

/**
 * Animation definitions for Pacman in different directions.
 */
const animations = {
    // droite/gauche ET haut/bas échangées par rapport à characters.png : la
    // bouche de la frame à offsetX=0 s'ouvre vers la gauche, celle à
    // offsetX=64*12 vers la droite, celle à offsetX=64*4 vers le haut, celle
    // à offsetX=64*8 vers le bas - vérifié pixel par pixel (feuille de sprite
    // custom, pas l'arcade classique), pas une histoire de sens de lecture.
    // (bugs signalés : Pac-Man "marche à l'envers" - la sprite regardait le
    // sens opposé au déplacement réel, d'abord gauche/droite puis haut/bas.)
    right: new Animation({
        ...animationBase,
        offsetX: 64 * 12,
    }),

    down: new Animation({
        ...animationBase,
        offsetX: 64 * 8,
    }),

    up: new Animation({
        ...animationBase,
        offsetX: 64 * 4,
    }),

    left: new Animation({
        ...animationBase,
    }),
};

export interface PacmanOptions extends CharacterOptions {
    frightenedSpeed?: number;
    frightenedDotSpeed?: number;
    dotSpeed?: number;
    addGameGhostEatEventListener: (listener: () => void) => void;
    addGameGhostModeFrightenedEnter: (listener: (ghost: unknown) => void) => void;
    addGameGhostModeFrightenedExit: (listener: (ghost: unknown) => void) => void;
}

/**
 * Default properties for Pacman instances.
 */
const defaults = {
    animations,
    dir: "l" as Direction,
    defaultAnimation: "left",
    preturn: true,
    frightenedSpeed: null as number | null,
    frightenedDotSpeed: null as number | null,
    dotSpeed: null as number | null,
};

/**
 * Pacman character class. Extends Character with Pacman-specific behavior.
 * @class Pacman
 * @extends {Character}
 */
class Pacman extends Character {
    // No initializers (see engine/Sprite.ts for why).
    frightenedSpeed!: number | null;
    frightenedDotSpeed!: number | null;
    dotSpeed!: number | null;

    _ghostFrightened: unknown[] = [];
    _eatenTurns = 0;
    _eatenTurnsFrames = 0;
    _lastEatenTurnsTime: number | null = null;

    /**
     * Creates an instance of Pacman.
     * @param options - Configuration options.
     */
    constructor(options: PacmanOptions) {
        super(options);

        // Only touches a key `if (key in options)` - see engine/Sprite.ts for
        // why that (not an unconditional assign) is what makes the fields
        // above's missing initializers actually take effect.
        (Object.keys(defaults) as (keyof typeof defaults)[]).forEach((key) => {
            if (key in options) (this as any)[key] = (options as any)[key];
        });

        const { addGameGhostEatEventListener, addGameGhostModeFrightenedEnter, addGameGhostModeFrightenedExit } =
            options;

        this._ghostFrightened = [];

        // Change tile. Set direction.
        this.on("item:tile", (tile: Tile) => {
            if (this._ghostFrightened.length) this._speed = this.frightenedSpeed as number;
            else this._speed = this.speed;

            if (tile.item) {
                if (tile.hasPill()) {
                    // Pill!
                    this.emit("item:eatpill", tile);
                } else if (tile.hasDot()) {
                    // Dot!
                    this.emit("item:eatdot", tile);
                    if (this._ghostFrightened.length) this._speed = this.frightenedDotSpeed as number;
                    else this._speed = this.dotSpeed as number;
                }
                tile.item.destroy();
                tile.item = null;
            }
        });

        addGameGhostEatEventListener(() => {
            this._eatenTurns = 9;
            this.dir = "r";
            this.pauseAnimation();
        });

        addGameGhostModeFrightenedEnter((ghost) => {
            this._ghostFrightened = this._ghostFrightened.filter((f) => f !== ghost).concat([ghost]);
        });

        addGameGhostModeFrightenedExit((ghost) => {
            this._ghostFrightened = this._ghostFrightened.filter((f) => f !== ghost);
        });
    }

    /**
     * Resets Pacman to initial state.
     */
    reset(): void {
        Character.prototype.reset.apply(this);
        this._lastEatenTurnsTime = null;
    }

    /**
     * Moves Pacman, handling eaten state animation if applicable.
     * @param dir - Direction to move. If not provided, uses current direction.
     */
    move(dir?: Direction | null): void {
        if (!this._eatenTurns) Character.prototype.move.call(this, dir);
        else if (!this._eatenTurnsFrames) {
            if (this._eatenTurns === 9) this.emit("item:die");
            if (this._eatenTurns > 2) {
                const directions: Record<Direction, Direction> = { d: "l", l: "u", u: "r", r: "d" };
                this.dir = directions[this.dir as Direction];
                this.setNextAnimation();
                this.update();
                this._eatenTurnsFrames = 5;
            } else this._eatenTurnsFrames = 25;

            this._eatenTurns--;

            if (this._eatenTurns === 0) this.emit("item:life");
        } else this._eatenTurnsFrames--;
    }
}

Object.assign(Pacman.prototype, defaults);

export default Pacman;
