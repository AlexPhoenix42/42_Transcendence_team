import Sprite, { type SpriteOptions } from "./engine/Sprite.ts";
import type Map from "./Map.ts";
import type Tile from "./Tile.ts";

export interface ItemOptions extends SpriteOptions {
    map?: Map;
}

/**
 * Base Item class for game entities. Extends Sprite with map integration.
 * @class Item
 * @extends {Sprite}
 */
class Item extends Sprite {
    map!: Map;

    /**
     * Creates an instance of Item.
     * @param options - Configuration options.
     */
    constructor(options: ItemOptions = {}) {
        super(options);

        if (options.map) this.map = options.map;
        // Half width and half height.
        this.offsetX = Math.trunc(this.width / 2);
        this.offsetY = Math.trunc(this.height / 2);
        // Render.
        this.render();
    }

    /**
     * Gets the tile at the item's current position.
     * @returns The tile at the item's position.
     */
    getTile(): Tile | null {
        return this.map.getTile(this.x, this.y, true);
    }

    /**
     * Destroys the item and removes its element from the DOM.
     */
    destroy(): this {
        super.destroy().removeElement();
        return this;
    }

    /**
     * Hides the item by setting display to 'none'.
     */
    hide(): void {
        this.el.style.display = "none";
    }

    /**
     * Shows the item by setting display to empty string.
     */
    show(): void {
        this.el.style.display = "";
    }
}

export default Item;
