import PacmanMan from "./PacmanMan.ts";
import type { PacmanOptions } from "./Pacman.ts";
import type { Direction } from "./Character.ts";
import type Tile from "./Tile.ts";

/**
 * Baby Pac-Man. Born when {@link PacmanMan} and Ms. Pac-Man meet (that part
 * lives in the game wiring, not here). Looks like a small Pac-Man wearing a
 * diaper and, on its own, toddles after the nearest parent.
 *
 * Reuses {@link PacmanMan} for the sprite + rotation; only adds the shrink, the
 * diaper element and the follow behaviour. Same factory shape as the other
 * characters: {@link module:factory/makePacmanBaby}.
 *
 * @class PacmanBaby
 * @extends {PacmanMan}
 */

/** Visual scale applied on top of the playground scaling factor. */
export const BABY_SCALE = 0.6;

const oppositeDir: Record<Direction, Direction> = { l: "r", r: "l", u: "d", d: "u" };

export interface PacmanBabyOptions extends PacmanOptions {
    getFollowTarget?: (() => Tile | null) | null;
}

class PacmanBaby extends PacmanMan {
    _getFollowTarget: (() => Tile | null) | null;

    /**
     * @param options - Same options as {@link Pacman}, plus:
     *   `getFollowTarget` - Returns the tile the baby should walk towards
     *   (typically the nearest parent's tile). If absent the baby just keeps
     *   going straight like a normal Pac-Man.
     */
    constructor(options: PacmanBabyOptions) {
        super(options);
        this._getFollowTarget = options.getFollowTarget || null;
        this.speed = options.speed != null ? options.speed : Math.round(this.speed * 0.85);
        this._speed = this.speed;
        this._renderDiaper();
    }

    /**
     * Walk one step: towards the follow target if there is one, otherwise
     * straight ahead (default Pac-Man behaviour).
     */
    move(): void {
        if (this._eatenTurns) {
            super.move();
            return;
        }

        const target = this._getFollowTarget && this._getFollowTarget();
        if (target) super.move(this._chooseDir(target));
        else super.move();
    }

    /**
     * Greedy direction pick: of the tiles it can enter (never straight back),
     * choose the one closest to the target.
     * @private
     */
    _chooseDir(targetTile: Tile): Direction {
        const here = this.getTile()!;
        const back = oppositeDir[this.dir as Direction];
        let best = this.dir as Direction;
        let bestDist = Infinity;

        for (const dir of ["u", "l", "d", "r"] as Direction[]) {
            if (dir === back) continue;
            if (!this.canGo(dir)) continue;
            const t = here.get(dir)!;
            const dist = (t.col - targetTile.col) ** 2 + (t.row - targetTile.row) ** 2;
            if (dist < bestDist) {
                bestDist = dist;
                best = dir;
            }
        }
        return best;
    }

    /**
     * Shrink the baby without moving it: append an extra scale after the base
     * transform (which already carries the translate + rotation + page factor).
     */
    transform(): void {
        super.transform();
        this.el.style.transform += ` scale(${BABY_SCALE})`;
    }

    /**
     * White diaper band across the lower half of the sprite.
     * @private
     */
    _renderDiaper(): void {
        const diaper = document.createElement("div");

        Object.assign(diaper.style, {
            position: "absolute",
            left: "16%",
            right: "16%",
            bottom: "10%",
            height: "36%",
            background: "#ffffff",
            border: "2px solid #dcdcdc",
            borderRadius: "4px 4px 10px 10px",
            boxSizing: "border-box",
            pointerEvents: "none",
        });

        this.el.appendChild(diaper);
    }
}

export default PacmanBaby;
