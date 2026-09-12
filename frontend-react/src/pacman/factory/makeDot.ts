import Animation from "../engine/Animation.ts";
import Item, { type ItemOptions } from "../Item.ts";

/**
 * Base animation configuration for dots.
 */
export const animationBase = {
    imageURL: "img/pills.png",
    numberOfFrame: 1,
};

/**
 * Factory function to create a dot item.
 * @param options - Configuration options passed to Item constructor.
 * @returns A new Item instance representing a dot.
 */
export default (options: ItemOptions): Item =>
    new Item({
        width: 8,
        height: 8,
        defaultAnimation: "white",
        animations: {
            white: new Animation({
                ...animationBase,
                offsetX: 24,
            }),
            yellow: new Animation({
                ...animationBase,
                offsetX: 24 + 32,
            }),
            red: new Animation({
                ...animationBase,
                offsetX: 24 + 32 * 2,
            }),
        },
        ...options,
    });
