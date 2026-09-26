import PacmanMan from "../PacmanMan.ts";
import type { PacmanOptions } from "../Pacman.ts";

/**
 * Sprite type constant for the classic (male) Pac-Man.
 */
export const SPRITE_PACMAN_MAN = "SPRITE_PACMAN_MAN";

/**
 * Factory function to create the classic Pac-Man ("the man").
 * @param options - Configuration options passed to the PacmanMan constructor.
 * @returns A new PacmanMan instance.
 */
export default (options: PacmanOptions): PacmanMan =>
    new PacmanMan({
        x: 452,
        y: 848,
        type: SPRITE_PACMAN_MAN,
        ...options,
    });
