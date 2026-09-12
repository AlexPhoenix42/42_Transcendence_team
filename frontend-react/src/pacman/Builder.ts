import Timer from "./engine/Timer.ts";
import Ghost, { type GhostOptions } from "./Ghost.ts";
import type Tile from "./Tile.ts";

/**
 * Duration, in seconds, a wall dropped by the Builder stays in place.
 */
export const WALL_DURATION = 10;

/**
 * Cooldown, in seconds, between two walls.
 */
export const WALL_COOLDOWN = 3;

interface BuilderWall {
    tile: Tile;
    code: string;
    el: HTMLElement;
    timer: Timer;
}

/**
 * Builder ghost. Same base behaviour as a regular {@link Ghost} (house exit,
 * scatter/chase AI, frightened/dead modes) but it never eats Pac-Man. Instead
 * it can drop a temporary wall on the tile ahead of it: the tile becomes solid
 * for {@link WALL_DURATION} seconds, then reverts to whatever it was.
 *
 * Kept in the same shape as the other ghosts so it can be created through a
 * factory ({@link module:factory/makeBuilder}) and dropped into the game roster
 * exactly like Pinky/Blinky/Inky/Sue.
 *
 * @class Builder
 * @extends {Ghost}
 */
class Builder extends Ghost {
    _walls: BuilderWall[] = [];
    _wallCooldown: Timer | null = null;

    /**
     * @param options - Same options as {@link Ghost}.
     */
    constructor(options: GhostOptions) {
        super(options);

        // List of { tile, code, el, timer } currently-active walls.
        this._walls = [];
        // Cooldown timer between walls. null means ready.
        this._wallCooldown = null;

        // Green tint + glow so the Builder stays distinct from the killer
        // ghosts, even while everyone is blue in frightened mode.
        this.el.style.filter = "hue-rotate(90deg) saturate(1.4) drop-shadow(0 0 3px #2fae2f)";
    }

    /**
     * Whether the Builder can drop a wall right now.
     */
    canDropWall(): boolean {
        if (this._wallCooldown && !this._wallCooldown.isElapsed()) return false;
        return true;
    }

    /**
     * Drop a wall on the tile directly ahead of the Builder (falls back to the
     * current tile if the one ahead is unusable).
     * @returns True if a wall was actually created.
     */
    dropWall(): boolean {
        if (!this.canDropWall()) return false;

        const current = this.getTile()!;
        let target = current.get(this.dir as any) || current;

        // Don't wall the house, tunnels, or a tile that is already solid.
        if (target.isWall() || target.isHouse() || target.isTunnel()) target = current;
        if (target.isWall() || target.isHouse() || target.isTunnel()) return false;

        const originalCode = target.code;
        target.code = "=";

        const el = this._renderWall(target);

        const wall: BuilderWall = { tile: target, code: originalCode, el, timer: new Timer(WALL_DURATION) };
        this._walls.push(wall);

        this._wallCooldown = new Timer(WALL_COOLDOWN);

        return true;
    }

    /**
     * @returns How many of the Builder's walls are currently standing.
     */
    activeWallCount(): number {
        return this._walls.length;
    }

    /**
     * Remove walls whose timer has elapsed. Call once per frame from the game
     * loop.
     */
    updateWalls(): void {
        for (let i = this._walls.length - 1; i >= 0; i--) {
            const wall = this._walls[i];
            if (wall.timer.isElapsed()) {
                wall.tile.code = wall.code;
                if (wall.el && wall.el.parentNode) wall.el.parentNode.removeChild(wall.el);
                this._walls.splice(i, 1);
            }
        }
    }

    /**
     * Destroys the Builder and clears every wall it left behind.
     */
    destroy(): this {
        this._walls.forEach((wall) => {
            wall.tile.code = wall.code;
            if (wall.el && wall.el.parentNode) wall.el.parentNode.removeChild(wall.el);
        });
        this._walls = [];
        super.destroy();
        return this;
    }

    /**
     * Creates the little DOM block that visualises a wall and inserts it next to
     * the Builder's own element so it scales with the playground.
     * @private
     * @param tile - The tile being walled.
     */
    _renderWall(tile: Tile): HTMLElement {
        const el = document.createElement("div");
        const size = tile.width * this.factor;

        Object.assign(el.style, {
            position: "absolute",
            width: `${size}px`,
            height: `${size}px`,
            left: `${(tile.x - tile.width / 2) * this.factor}px`,
            top: `${(tile.y - tile.height / 2) * this.factor}px`,
            background: "repeating-linear-gradient(45deg, #1d7a1d, #1d7a1d 4px, #2fae2f 4px, #2fae2f 8px)",
            border: "2px solid #0d4d0d",
            boxSizing: "border-box",
            zIndex: 5,
            pointerEvents: "none",
        });

        this.el.parentNode!.appendChild(el);

        return el;
    }

    /**
     * Builder never eats Pac-Man. {@link Ghost#move} emits `item:eat` on contact;
     * we drop just that event and let everything else through (it can still be
     * eaten while frightened, still changes mode, still emits `item:tile`, ...).
     * @param event - Event name.
     * @param args - Event arguments.
     */
    emit(event: string, ...args: unknown[]): this {
        if (event === "item:eat") return this;
        return super.emit(event, ...args);
    }
}

export default Builder;
