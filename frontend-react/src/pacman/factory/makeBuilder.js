import Animation from '../engine/Animation.js';
import Builder from '../Builder.js';
import { animations, animationBase } from '../Ghost.js';

/**
 * Sprite type constant for the Builder ghost.
 * @constant {string}
 */
export const SPRITE_BUILDER = 'SPRITE_BUILDER';

/**
 * Factory function to create the Builder ghost. Same shape as
 * {@link module:factory/makeGhost}: it fills in the direction animations and a
 * chase target, then returns a {@link Builder}.
 *
 * The Builder borrows the orange ghost's sprite row; {@link Builder} tints it
 * green at runtime so it stays visually distinct from Sue.
 *
 * @param {Object} options - Configuration options passed to the Builder constructor.
 * @returns {Builder} A new Builder instance.
 */
export default (options) => new Builder(Object.assign({
    type : SPRITE_BUILDER,
    dir : 'u',
    waitTime : 2,
    scatterTarget : 953,
    defaultAnimation : 'up',
    // Head roughly for Pac-Man so it roams the maze and gets in the way.
    getChaseTarget : function() {
        return this.getPacmanData().tile;
    },
    animations : {
        ...animations,
        right : new Animation({ ...animationBase, offsetY : 188, offsetX : -2 }),
        down : new Animation({ ...animationBase, offsetY : 188, offsetX : 64 * 2 - 2 }),
        up : new Animation({ ...animationBase, offsetY : 188, offsetX : 64 * 4 - 2 }),
        left : new Animation({ ...animationBase, offsetY : 188, offsetX : 64 * 6 - 2 })
    }
}, options));
