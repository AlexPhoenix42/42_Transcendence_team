import Animation, { ANIMATION_HORIZONTAL } from './engine/Animation.js';
import Pacman from './Pacman.js';

/**
 * Sprite type constant for the "plain" (male) Pac-Man.
 * @constant {string}
 */
export const SPRITE_PACMAN_PLAIN = 'SPRITE_PACMAN_PLAIN';

/**
 * Same rig as {@link Pacman} (Ms. Pac-Man: 4 directions × 4 frames, no
 * rotation needed) but pointed at `characters-plain.png` — `characters.png`
 * with the bow + lipstick pixels (exact colour `#f80000`) recoloured to the
 * body's yellow (`#f8f800`). Nothing else in the sheet changes, so the
 * geometry below is copy-pasted from `Pacman.js` on purpose: same offsets,
 * same frame count, same row.
 *
 * This is what a `pacman` / `blocker` role actually looks like, on every
 * client (see `net/MultiplayerGame.js`) — unlike the old single-frame,
 * rotated "classic" sprite (`PacmanMan`), this one never rotates so it never
 * misaligns when turning.
 */
const animationBase = {
    imageURL : 'img/characters-plain.png',
    numberOfFrame : 4,
    delta : 64,
    refreshRate : 60,
    offsetY : 60,
    type : ANIMATION_HORIZONTAL
};

/** Exported so `MultiplayerGame` can swap the LOCAL player's Pac-Man onto
 * this exact rig too (same `Animation` instances - stateless, shared safely,
 * same pattern `Pacman.js` itself uses via its prototype). */
export const animations = {
    'right' : new Animation({ ...animationBase }),
    'down'  : new Animation({ ...animationBase, offsetX : 64 * 4 }),
    'up'    : new Animation({ ...animationBase, offsetX : 64 * 8 }),
    'left'  : new Animation({ ...animationBase, offsetX : 64 * 12 })
};

const defaults = {
    animations,
    dir : 'l',
    defaultAnimation : 'left'
};

/**
 * @class PacmanPlain
 * @extends {Pacman}
 */
class PacmanPlain extends Pacman {
    /**
     * @param {Object} options - Same options as {@link Pacman}.
     */
    constructor(options) {
        super({ ...defaults, ...options });
    }
}

Object.assign(PacmanPlain.prototype, defaults);

export default PacmanPlain;
