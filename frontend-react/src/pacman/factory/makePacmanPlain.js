import PacmanPlain from '../PacmanPlain.js';

/**
 * Sprite type constant for the "plain" (male) Pac-Man.
 * @constant {string}
 */
export const SPRITE_PACMAN_PLAIN = 'SPRITE_PACMAN_PLAIN';

/**
 * Factory function to create the "plain" Pac-Man — same rig as Ms. Pac-Man,
 * bow and lipstick recoloured away. Used for the `pacman` / `blocker` roles.
 * @param {Object} options - Configuration options passed to the PacmanPlain constructor.
 * @returns {PacmanPlain} A new PacmanPlain instance.
 */
export default (options) => new PacmanPlain({
    x : 452,
    y : 848,
    type : SPRITE_PACMAN_PLAIN,
    ...options
});
