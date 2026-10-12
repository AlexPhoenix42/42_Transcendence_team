import PacmanBaby, { type PacmanBabyOptions } from "../PacmanBaby.ts";

/**
 * Sprite type constant for baby Pac-Man.
 */
export const SPRITE_PACMAN_BABY = "SPRITE_PACMAN_BABY";

/**
 * Factory function to create baby Pac-Man.
 * @param options - Configuration options passed to the PacmanBaby constructor.
 *   `getFollowTarget` returns the tile the baby walks towards.
 * @returns A new PacmanBaby instance.
 */
export default (options: PacmanBabyOptions): PacmanBaby =>
    new PacmanBaby({
        x: 452,
        y: 848,
        type: SPRITE_PACMAN_BABY,
        ...options,
    });
