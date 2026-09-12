import type Map from "./Map.ts";

/** Minimal shape shared by everything a tile can hold at `this.item` (dots, pills). */
export interface TileItem {
    destroy(): unknown;
    hide(): unknown;
}

/**
 * Tile class representing a single tile in the game map.
 * @class Tile
 */
class Tile {
    code: string;
    col: number;
    row: number;
    map: Map;
    width = 32;
    height = 32;
    x: number;
    y: number;
    item?: TileItem | null;

    /**
     * Creates an instance of Tile.
     * @param code - The tile code character ('=', 'h', 't', '.', '*', etc.).
     * @param col - Column index in the map.
     * @param row - Row index in the map.
     * @param map - Reference to the parent map.
     */
    constructor(code: string, col: number, row: number, map: Map) {
        this.code = code;

        this.col = col;
        this.row = row;

        this.map = map;

        this.width = 32;
        this.height = 32;

        this.x = this.col * this.width + this.width / 2;

        this.y = this.row * this.height + this.height / 2 + 4; // Original Pacman has tile's center at x : 4, y : 5 position.
    }

    /**
     * Checks if this tile is a wall.
     * @returns True if the tile is a wall.
     */
    isWall(): boolean {
        return this.code === "=";
    }

    /**
     * Checks if this tile is part of the ghost house.
     * @returns True if the tile is in the ghost house.
     */
    isHouse(): boolean {
        return this.code === "h";
    }

    /**
     * Checks if this tile is a tunnel.
     * @returns True if the tile is a tunnel.
     */
    isTunnel(): boolean {
        return this.code === "t";
    }

    /**
     * Checks if this tile has a dot item.
     * @returns True if the tile has a dot.
     */
    hasDot(): boolean {
        return !!this.item && this.code === ".";
    }

    /**
     * Checks if this tile has a power pill item.
     * @returns True if the tile has a power pill.
     */
    hasPill(): boolean {
        return !!this.item && this.code === "*";
    }

    /**
     * Gets the adjacent tile in the specified direction.
     * @param dir - Direction ('u', 'd', 'l', 'r').
     * @returns The adjacent tile or null.
     */
    get(dir: string): Tile | null {
        if (dir === "u") return this.getU();
        if (dir === "d") return this.getD();
        if (dir === "l") return this.getL();
        if (dir === "r") return this.getR();
        return null;
    }

    /**
     * Gets the tile above this one.
     * @returns The tile above or null.
     */
    getU(): Tile | null {
        return this.map.getTile(this.col, this.row - 1) || null;
    }

    /**
     * Gets the tile below this one.
     * @returns The tile below or null.
     */
    getD(): Tile | null {
        return this.map.getTile(this.col, this.row + 1) || null;
    }

    /**
     * Gets the tile to the left of this one.
     * @returns The tile to the left or null.
     */
    getL(): Tile | null {
        return this.map.getTile(this.col - 1, this.row) || null;
    }

    /**
     * Gets the tile to the right of this one.
     * @returns The tile to the right or null.
     */
    getR(): Tile | null {
        return this.map.getTile(this.col + 1, this.row) || null;
    }
}

export default Tile;
