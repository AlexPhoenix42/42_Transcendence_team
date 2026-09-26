/** A point in the map's pixel space (a `Tile`, a sprite, ...). */
export interface Point {
    x: number;
    y: number;
}

/**
 * Distance between two tiles.
 * @param tileA - The first tile.
 * @param tileB - The second tile.
 * @returns The distance between the two tiles.
 */
const getDistance = (tileA: Point, tileB: Point): number => {
    const x = tileA.x, x1 = tileB.x, y = tileA.y, y1 = tileB.y;
    return Math.sqrt(Math.pow(x - x1, 2) + Math.pow(y - y1, 2));
};

export default getDistance;
