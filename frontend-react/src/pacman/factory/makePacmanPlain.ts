import PacmanPlain from "../PacmanPlain.ts";
import type { PacmanOptions } from "../Pacman.ts";

/**
 * Sprite type constant for the "plain" (male) Pac-Man.
 */
export const SPRITE_PACMAN_PLAIN = "SPRITE_PACMAN_PLAIN";

/**
 * Factory function to create the "plain" Pac-Man — same rig as Ms. Pac-Man,
 * bow and lipstick recoloured away. Used for the `pacman` / `blocker` roles.
 * @param options - Configuration options passed to the PacmanPlain constructor.
 * @returns A new PacmanPlain instance.
 */
export default (options: PacmanOptions): PacmanPlain =>
    new PacmanPlain({
        x: 452,
        y: 848,
        type: SPRITE_PACMAN_PLAIN,
        ...options,
    });
