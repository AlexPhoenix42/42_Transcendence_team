import Pacman, { type PacmanOptions } from "../Pacman.ts";

/**
 * Sprite type constant for Ms. Pacman.
 */
export const SPRITE_MS_PACMAN = "SPRITE_MS_PACMAN";

/**
 * Factory function to create a Ms. Pacman instance.
 * @param options - Configuration options passed to Pacman constructor.
 * @returns A new Pacman instance configured as Ms. Pacman.
 */
export default (options: PacmanOptions): Pacman =>
    new Pacman({
        x: 452,
        y: 848,
        type: SPRITE_MS_PACMAN,
        ...options,
    });
