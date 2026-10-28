import Animation, { ANIMATION_HORIZONTAL } from "./engine/Animation.ts";
import Pacman, { type PacmanOptions } from "./Pacman.ts";
import type { Direction } from "./Character.ts";

/**
 * The classic yellow Pac-Man ("the man"). Same behaviour as {@link Pacman}
 * (which the game already uses for Ms. Pac-Man), only the look changes: the
 * spritesheet's top row holds a single left-facing 3-frame chomp, so instead of
 * one animation per direction we keep that one animation and rotate the sprite.
 *
 * Same shape as {@link Pacman} / Ms. Pac-Man so it plugs into the game through
 * {@link module:factory/makePacmanMan}.
 *
 * @class PacmanMan
 * @extends {Pacman}
 */

/** Single chomp animation, top-left of `img/characters.png` (faces left). */
const chomp = new Animation({
    imageURL: "img/characters.png",
    numberOfFrame: 3,
    delta: 64,
    refreshRate: 60,
    offsetX: 0,
    offsetY: 0,
    type: ANIMATION_HORIZONTAL,
});

/** The top-row chomp frame faces LEFT; rotate clockwise for the rest. */
const ANGLE_BY_DIR: Record<Direction, number> = { l: 0, u: 90, r: 180, d: 270 };

const defaults = {
    animations: { chomp },
    defaultAnimation: "chomp",
};

class PacmanMan extends Pacman {
    /**
     * @param options - Same options as {@link Pacman}.
     */
    constructor(options: PacmanOptions) {
        super({ ...defaults, ...options });
        this._applyRotation();
    }

    /**
     * Keep the single chomp animation and turn the sprite to match the
     * direction instead of swapping animations.
     */
    setNextAnimation(): void {
        this._nextAnimation = this.animations.chomp;
        this._applyRotation();
    }

    /**
     * Rotate the sprite so the mouth points where Pac-Man is heading.
     * @private
     */
    _applyRotation(): void {
        const angle = ANGLE_BY_DIR[this.dir as Direction];
        if (angle != null && angle !== this.angle) this.rotate(angle);
    }
}

Object.assign(PacmanMan.prototype, defaults);

export default PacmanMan;
