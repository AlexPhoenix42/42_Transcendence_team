import Animation, { ANIMATION_VERTICAL } from "../engine/Animation.ts";
import Item, { type ItemOptions } from "../Item.ts";

/**
 * Base animation configuration for power pills.
 */
const animationBase = {
    imageURL: "img/pills.png",
    numberOfFrame: 2,
    delta: 24,
    refreshRate: 450,
    type: ANIMATION_VERTICAL,
};

/**
 * Factory function to create a power pill item.
 * @param options - Configuration options passed to Item constructor.
 * @returns A new Item instance representing a power pill.
 */
export default (options: ItemOptions): Item =>
    new Item({
        width: 24,
        height: 24,
        animations: {
            white: new Animation({
                ...animationBase,
            }),
            yellow: new Animation({
                ...animationBase,
                offsetX: 24 + 8,
            }),
            red: new Animation({
                ...animationBase,
                offsetX: (24 + 8) * 2,
            }),
        },
        ...options,
    });
