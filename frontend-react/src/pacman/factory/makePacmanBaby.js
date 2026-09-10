import PacmanBaby from '../PacmanBaby.js';

/**
 * Sprite type constant for baby Pac-Man.
 * @constant {string}
 */
export const SPRITE_PACMAN_BABY = 'SPRITE_PACMAN_BABY';

/**
 * Factory function to create baby Pac-Man.
 * @param {Object} options - Configuration options passed to the PacmanBaby constructor.
 * @param {Function} [options.getFollowTarget] - Returns the tile the baby walks towards.
 * @returns {PacmanBaby} A new PacmanBaby instance.
 */
export default (options) => new PacmanBaby({
    x : 452,
    y : 848,
    type : SPRITE_PACMAN_BABY,
    ...options
});
