import Pacman from "./Pacman.ts";
import type GameModel from "./GameModel.ts";

export interface LivesOptions {
    x: number;
    y: number;
    model: GameModel;
    factor: number;
    addSprite: (sprite: Pacman) => void;
}

/**
 * Lives class that manages the display of remaining lives.
 * @class Lives
 */
class Lives {
    pacmans: Pacman[] = [];
    model: GameModel;

    /**
     * Creates an instance of Lives.
     * @param options - Configuration options.
     */
    constructor(options: LivesOptions) {
        this.pacmans = [];

        this.model = options.model;

        for (let i = 0; i < 5; i++) {
            const pacman = new Pacman({
                x: options.x + i * 70,
                y: options.y,
                factor: options.factor,
                defaultAnimation: "right",
                addGameGhostEatEventListener: () => {},
                addGameGhostModeFrightenedEnter: () => {},
                addGameGhostModeFrightenedExit: () => {},
                normalizeRefreshRate: () => 1,
            });

            options.addSprite(pacman);
            this.pacmans.push(pacman);

            if (i > this.model.lives - 2) this.pacmans[i].hide();
        }

        this.model.on("change:lives", this.render.bind(this));
    }

    /**
     * Renders the lives indicators based on remaining lives.
     */
    render(): void {
        for (let i = 0; i < 5; i++) {
            if (i > this.model.lives - 2) this.pacmans[i].hide();
            else this.pacmans[i].show();
        }
    }
}

export default Lives;
