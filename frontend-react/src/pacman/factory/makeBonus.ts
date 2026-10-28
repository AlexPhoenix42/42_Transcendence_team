import Animation from "../engine/Animation.ts";
import Bonus, { animations, animationBase, type BonusOptions } from "../Bonus.ts";

/**
 * Factory function to create a bonus item with a specific index.
 * @param index - The bonus index (0-7) determining which bonus sprite to use.
 * @param options - Configuration options passed to Bonus constructor.
 * @returns A new Bonus instance.
 */
export default (index: number, options: BonusOptions): Bonus =>
    new Bonus({
        animations: {
            ...animations,
            default: new Animation({
                ...animationBase,
                offsetX: 60 * index,
            }),
        },
        ...options,
    });
