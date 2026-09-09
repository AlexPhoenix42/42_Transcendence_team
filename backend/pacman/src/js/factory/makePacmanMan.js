import PacmanMan from '../PacmanMan.js';

/**
 * Sprite type constant for the classic (male) Pac-Man.
 * @constant {string}
 */
export const SPRITE_PACMAN_MAN = 'SPRITE_PACMAN_MAN';

/**
 * Factory function to create the classic Pac-Man ("the man").
 * @param {Object} options - Configuration options passed to the PacmanMan constructor.
 * @returns {PacmanMan} A new PacmanMan instance.
 */
export default (options) => new PacmanMan({
    x : 452,
    y : 848,
    type : SPRITE_PACMAN_MAN,
    ...options
});
