import Timer from '../engine/Timer.js';

/**
 * Tile code used for a Builder wall. Distinct from `'='` (real maze wall) on
 * purpose: `Tile.isWall()` only matches `'='`, so a Builder wall stops nobody by
 * default - Pac-Men are blocked by an explicit check (see MultiplayerGame),
 * ghosts walk straight through.
 * @constant {string}
 */
export const BUILDER_WALL_CODE = 'B';

/**
 * Tile code used for a Blocker wall — the Pac-Man-side mirror of a Builder
 * wall. Also invisible to `Tile.isWall()`; ghosts/Builder avatars are blocked
 * by an explicit check (see MultiplayerGame's `_blockGhostOnBlockerWalls`),
 * Pac-Men walk straight through.
 * @constant {string}
 */
export const BLOCKER_WALL_CODE = 'K';

/**
 * WallLayer - the temporary walls dropped by Builder players, shared over the
 * network.
 *
 * A wall flips a map tile to {@link BUILDER_WALL_CODE} and draws a green block
 * over it, then reverts after its TTL. The same code runs on every client: the
 * Builder tells the room where it dropped a wall, each client applies it here.
 *
 * @class WallLayer
 */
class WallLayer {
    /**
     * @param {Game} game - The (multiplayer) game instance; needs `map`,
     *   `scenegraph` and `scaling`.
     */
    constructor(game) {
        this.game = game;
        /** @type {Map<string, {tile, code, el, timer}>} keyed by "col,row" */
        this._walls = new Map();
    }

    /**
     * Drop a wall on a map cell (no-op if the cell is already solid or already
     * walled).
     * @param {number} col
     * @param {number} row
     * @param {number} [ttlSeconds=10]
     * @param {string} [wallCode=BUILDER_WALL_CODE] - Which camp the wall blocks.
     */
    add(col, row, ttlSeconds, wallCode) {
        if (typeof col !== 'number' || typeof row !== 'number') return;
        const key = `${col},${row}`;
        if (this._walls.has(key)) return;

        const tile = this.game.map.getTile(col, row);
        if (!tile || tile.isWall() || tile.isHouse() || tile.isTunnel()) return;

        const code = tile.code;
        const wall = wallCode || BUILDER_WALL_CODE;
        tile.code = wall;

        this._walls.set(key, {
            tile : tile,
            code : code,
            wallCode : wall,
            el : this._render(tile, wall),
            timer : new Timer(ttlSeconds || 10)
        });
    }

    /**
     * Remove the wall standing on `(col, row)`, if any. No-op otherwise —
     * called both optimistically (Blocker destroying its own view) and from
     * the network echo, so it must be idempotent.
     * @param {number} col
     * @param {number} row
     */
    removeAt(col, row) {
        const key = `${col},${row}`;
        const wall = this._walls.get(key);
        if (wall) this._remove(key, wall);
    }

    /**
     * Revert walls whose timer elapsed. Call once per frame.
     */
    update() {
        this._walls.forEach((wall, key) => {
            if (wall.timer.isElapsed()) {
                this._remove(key, wall);
            }
        });
    }

    /**
     * @returns {number} Walls currently standing.
     */
    count() {
        return this._walls.size;
    }

    /**
     * Revert every wall (used on level reset / teardown).
     */
    clear() {
        this._walls.forEach((wall, key) => this._remove(key, wall));
    }

    /**
     * @private
     */
    _remove(key, wall) {
        wall.tile.code = wall.code;
        if (wall.el && wall.el.parentNode) wall.el.parentNode.removeChild(wall.el);
        this._walls.delete(key);
    }

    /**
     * @private
     */
    _render(tile, wallCode) {
        const el = document.createElement('div');
        const factor = this.game.scaling.getFactor();
        const isBlocker = wallCode === BLOCKER_WALL_CODE;

        Object.assign(el.style, {
            position : 'absolute',
            width : `${tile.width * factor}px`,
            height : `${tile.height * factor}px`,
            left : `${(tile.x - tile.width / 2) * factor}px`,
            top : `${(tile.y - tile.height / 2) * factor}px`,
            background : isBlocker
                ? 'repeating-linear-gradient(45deg, #1d3d7a, #1d3d7a 4px, #2f6fae 4px, #2f6fae 8px)'
                : 'repeating-linear-gradient(45deg, #1d7a1d, #1d7a1d 4px, #2fae2f 4px, #2fae2f 8px)',
            border : isBlocker ? '2px solid #0d2a4d' : '2px solid #0d4d0d',
            boxSizing : 'border-box',
            zIndex : 5,
            pointerEvents : 'none'
        });

        this.game.scenegraph.appendChild(el);
        return el;
    }
}

export default WallLayer;
