import makeBonus from "./factory/makeBonus.ts";
import type Bonus from "./Bonus.ts";
import type GameModel from "./GameModel.ts";

export interface BonusesOptions {
    x: number;
    y: number;
    model: GameModel;
    factor: number;
    addSprite: (sprite: Bonus) => void;
}

/**
 * Bonuses class that manages the display of level bonus indicators.
 * @class Bonuses
 */
class Bonuses {
    bonuses: Bonus[] = [];
    x: number;
    y: number;
    model: GameModel;

    /**
     * Creates an instance of Bonuses.
     * @param options - Configuration options.
     */
    constructor(options: BonusesOptions) {
        this.bonuses = [];

        this.x = options.x;
        this.y = options.y;

        this.model = options.model;

        for (let i = 0; i < 8; i++) {
            const bonus = makeBonus(i, {
                x: options.x - i * 64,
                y: options.y,
                factor: options.factor,
                // These are purely decorative (the level's "fruits collected"
                // row) - never moved, so no real Pac-Man to track.
                getPacmanData: null as unknown as () => never,
                normalizeRefreshRate: () => 1,
            });

            options.addSprite(bonus);
            this.bonuses.push(bonus);

            if (i >= this.model.level) this.bonuses[i].hide();
        }

        this.model.on("change:level", this.render.bind(this));
    }

    /**
     * Renders the bonus indicators based on the current level.
     */
    render(): void {
        for (let i = 0; i < 8; i++) {
            if (i >= this.model.level) this.bonuses[i].hide();
            else this.bonuses[i].show();
        }
    }
}

export default Bonuses;
