import Animation from "../engine/Animation.ts";
import Ghost, { animations, animationBase, type GhostOptions } from "../Ghost.ts";
import getDistance from "../helper/getDistance.ts";

/**
 * Sprite type constant for Pinky ghost.
 */
export const SPRITE_PINKY = "SPRITE_PINKY";
/**
 * Sprite type constant for Blinky ghost.
 */
export const SPRITE_BLINKY = "SPRITE_BLINKY";
/**
 * Sprite type constant for Inky ghost.
 */
export const SPRITE_INKY = "SPRITE_INKY";
/**
 * Sprite type constant for Sue ghost.
 */
export const SPRITE_SUE = "SPRITE_SUE";

export type GhostLabel = "pinky" | "blinky" | "inky" | "sue";

/**
 * Factory function to create a ghost with specific AI behavior based on label.
 * @param label - Ghost type ('pinky', 'blinky', 'inky', 'sue').
 * @param options - Configuration options passed to Ghost constructor.
 * @returns A new Ghost instance with type-specific configuration.
 */
export default (label: GhostLabel, options: GhostOptions): Ghost => {
    // Pink Ghost
    if (label === "pinky") {
        options = Object.assign(
            {
                type: SPRITE_PINKY,
                dir: "d",
                defaultAnimation: "down",
                getChaseTarget(this: Ghost) {
                    const pacmanData = this.getPacmanData();
                    const t = pacmanData.tile;
                    const dir = pacmanData.dir;
                    return t!.get(dir as any)!.get(dir as any)!.get(dir as any)!.get(dir as any);
                },
                animations: {
                    ...animations,
                    right: new Animation({
                        ...animationBase,
                        offsetY: 252,
                        offsetX: -2,
                    }),

                    down: new Animation({
                        ...animationBase,
                        offsetY: 252,
                        offsetX: 64 * 2 - 2,
                    }),

                    up: new Animation({
                        ...animationBase,
                        offsetY: 252,
                        offsetX: 64 * 4 - 2,
                    }),

                    left: new Animation({
                        ...animationBase,
                        offsetY: 252,
                        offsetX: 64 * 6 - 2,
                    }),
                },
            },
            options,
        ) as GhostOptions;
    }
    // Red Ghost
    if (label === "blinky") {
        options = Object.assign(
            {
                type: SPRITE_BLINKY,
                dir: "l",
                waitTime: 0,
                scatterTarget: 25,
                defaultAnimation: "left",
                animations: {
                    ...animations,
                    right: new Animation({
                        ...animationBase,
                        offsetY: 124,
                        offsetX: -2,
                    }),

                    down: new Animation({
                        ...animationBase,
                        offsetY: 124,
                        offsetX: 64 * 2 - 2,
                    }),

                    up: new Animation({
                        ...animationBase,
                        offsetY: 124,
                        offsetX: 64 * 4 - 2,
                    }),

                    left: new Animation({
                        ...animationBase,
                        offsetY: 124,
                        offsetX: 64 * 6 - 2,
                    }),
                },
            },
            options,
        ) as GhostOptions;
    }
    // Cyan Ghost
    if (label === "inky") {
        options = Object.assign(
            {
                type: SPRITE_INKY,
                dir: "u",
                waitTime: 6,
                scatterTarget: 979,
                defaultAnimation: "up",
                getChaseTarget(this: Ghost) {
                    const pacmanData = this.getPacmanData();
                    let pacmanTile = pacmanData.tile;
                    const blinkyTile = this.blinky!.getTile()!;
                    const dir = pacmanData.dir;

                    pacmanTile = pacmanTile!.get(dir as any)!.get(dir as any); // Two tiles in front of pacman

                    return this.map.getTile(
                        pacmanTile!.col + pacmanTile!.col - blinkyTile.col,
                        pacmanTile!.row + pacmanTile!.row - blinkyTile.row,
                    );
                },
                animations: {
                    ...animations,
                    right: new Animation({
                        ...animationBase,
                        offsetY: 316,
                        offsetX: -2,
                    }),

                    down: new Animation({
                        ...animationBase,
                        offsetY: 316,
                        offsetX: 64 * 2 - 2,
                    }),

                    up: new Animation({
                        ...animationBase,
                        offsetY: 316,
                        offsetX: 64 * 4 - 2,
                    }),

                    left: new Animation({
                        ...animationBase,
                        offsetY: 316,
                        offsetX: 64 * 6 - 2,
                    }),
                },
            },
            options,
        ) as GhostOptions;
    }
    // Orange Ghost
    if (label === "sue") {
        options = Object.assign(
            {
                type: SPRITE_SUE,
                dir: "u",
                waitTime: 8,
                scatterTarget: 953,
                defaultAnimation: "up",
                getChaseTarget(this: Ghost) {
                    const t = this.getPacmanData().tile!;
                    const d = getDistance(t, this.getTile()!);
                    // NB: `t.w` doesn't exist (pre-existing bug carried over
                    // as-is from the JS - looks like it meant `t.width`), so
                    // this comparison is always false and Sue never actually
                    // chases: she runs the "far away" (scatter) branch always.
                    if (d > 16 * (t as any).w) return t;
                    else return this.scatterTarget;
                },
                animations: {
                    ...animations,
                    right: new Animation({
                        ...animationBase,
                        offsetY: 188,
                        offsetX: -2,
                    }),

                    down: new Animation({
                        ...animationBase,
                        offsetY: 188,
                        offsetX: 64 * 2 - 2,
                    }),

                    up: new Animation({
                        ...animationBase,
                        offsetY: 188,
                        offsetX: 64 * 4 - 2,
                    }),

                    left: new Animation({
                        ...animationBase,
                        offsetY: 188,
                        offsetX: 64 * 6 - 2,
                    }),
                },
            },
            options,
        ) as GhostOptions;
    }

    return new Ghost(options);
};
