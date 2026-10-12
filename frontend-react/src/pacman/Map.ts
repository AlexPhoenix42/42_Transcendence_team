import Tile from "./Tile.ts";

/**
 * Map class representing the game maze.
 * @class Map
 */
class Map {
    tiles: Tile[] = [];
    width: number;
    height: number;
    tunnels: Tile[] = [];
    house!: Tile;
    houseCenter!: Tile;
    tileWidth!: number;
    tileHeight!: number;

    /**
     * Creates an instance of Map.
     * @param data - Array of strings representing the map layout.
     * Each string is a row, each character is a tile code.
     */
    constructor(data: string[]) {
        /*
        data = ['----------------------------',
                '============================',
                '=......==..........==......=',
                '=*====.==.========.==.====*=']
        */
        // Store tiles in array.
        this.tiles = [];
        // Set with and height according to data.
        this.width = data[0].length;
        this.height = data.length;

        this.tunnels = [];

        // Instantiate tiles and store them.
        for (let y = 0; y < this.height; y++) {
            const r = data[y];
            for (let x = 0; x < this.width; x++) {
                const code = r.charAt(x);
                const tile = new Tile(code, x, y, this);
                this.tiles.push(tile);
                if (tile.isHouse() && !this.house) {
                    // Store left house door
                    this.house = tile;
                }
                if (tile.isTunnel() && (tile.col === 0 || tile.col === this.width - 1)) {
                    this.tunnels.push(tile);
                }
            }
        }

        this.houseCenter = this.house.getD()!.getD()!;

        // Cache tile dimensions
        this.tileWidth = this.tiles[0].width;
        this.tileHeight = this.tiles[0].height;
    }

    /**
     * Gets a tile at the specified coordinates.
     * @param col - Column index or x coordinate in pixels.
     * @param row - Row index or y coordinate in pixels.
     * @param inPixels - If true, coordinates are in pixels and will be converted.
     * @returns The tile at the specified position, or null if out of bounds.
     */
    getTile(col: number, row: number, inPixels?: boolean): Tile | null {
        if (inPixels) {
            col = Math.trunc(col / this.tileWidth);
            row = Math.trunc(row / this.tileHeight);
        }

        if (col > this.width - 1) col = 0;
        if (col < 0) col = this.width - 1;
        if (row > this.height - 1) row = 0;
        if (row < 0) row = this.height - 1;

        const idx = row * this.width + col;

        return this.tiles[idx] || null;
    }

    /**
     * Destroys all items on all tiles in the map.
     */
    destroyItems(): void {
        let i = this.tiles.length;
        while (i--) {
            const t = this.tiles[i];
            if (t.item) t.item.destroy();
        }
    }

    /**
     * Hides all items on all tiles in the map.
     */
    hideItems(): void {
        let i = this.tiles.length;
        while (i--) {
            const t = this.tiles[i];
            if (t.item) t.item.hide();
        }
    }
}

export default Map;
