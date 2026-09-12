import JsPacman from './Game.ts';
import { STATUS_PLAY } from './GameModel.ts';
import Timer from './engine/Timer.ts';
import GameRules from './GameRules.js';
import makeBuilder from './factory/makeBuilder.ts';
import makePacmanMan from './factory/makePacmanMan.ts';
import makePacmanBaby from './factory/makePacmanBaby.ts';

/**
 * WASD / ZQSD keycodes for the second player.
 * @constant {Object}
 */
const MAN_KEYS = {
    up : [87, 90],   // W, Z
    left : [65, 81],  // A, Q
    down : [83],      // S
    right : [68]      // D
};

/**
 * Game variant used to build and test the advanced rules **without any
 * networking**. It keeps the whole jsPacman game intact and only adds on top:
 *
 * - the {@link Builder} ghost (replaces Sue) and its temporary walls;
 * - a second player, {@link PacmanMan}, driven with WASD / ZQSD;
 * - {@link PacmanBaby}, born when the two Pac-Men meet, that then follows the
 *   nearest parent;
 * - timed "freeze" / "prison" effects, whose durations come from
 *   {@link GameRules}, triggered from the test page buttons.
 *
 * Nothing in `Game.js` is edited: `makeLevel()` and `mainLoop()` call `super`
 * and append their extra work, `reset()` cleans up the extra characters. If a
 * bug is in the base game it is fixed in `Game.js`; if it is in the rules layer
 * it is fixed here.
 *
 * @class RulesGame
 * @extends {JsPacman}
 */
class RulesGame extends JsPacman {
    /**
     * Builds the level: the normal roster, then Builder + Pac-Man Man.
     * Called from the `JsPacman` constructor, so everything is lazy-guarded.
     */
    makeLevel() {
        super.makeLevel();

        if (!this.rules) this.rules = new GameRules(2, 4);
        if (!this._effects) this._effects = new Map(); // character -> { type, timer }

        this._replaceSueWithBuilder();
        this._addPacmanMan();

        this.baby = null;
        this._babyGraceFrames = 90; // ~3s before a baby can be born
    }

    /**
     * Destroy the extra characters before the base class rebuilds the level.
     */
    reset() {
        if (this.pacmanMan) {
            this.pacmanMan.destroy();
            this.pacmanMan = null;
        }
        if (this.baby) {
            this.baby.destroy();
            this.baby = null;
        }
        if (this._effects) this._effects.clear();

        // this.builder === this.sue, super.reset() destroys this.sue for us.
        super.reset();
    }

    /**
     * Base game loop + rules-layer work (second player, baby, walls, effects).
     */
    mainLoop() {
        super.mainLoop();

        if (this.model.status !== STATUS_PLAY || this._pauseFrames) return;

        if (this.pacmanMan && !this._isImmobilized(this.pacmanMan)) {
            this.pacmanMan.move(this._getManInput());
        }

        if (this._babyGraceFrames > 0) this._babyGraceFrames--;
        if (!this.baby && this._babyGraceFrames === 0 && this._sameTile(this.pacman, this.pacmanMan)) {
            this._spawnBaby();
        }
        if (this.baby && !this._isImmobilized(this.baby)) this.baby.move();

        if (this.builder) this.builder.updateWalls();

        this._tickEffects();
    }

    // ================= public API used by rules-test.html =================

    /**
     * Ask the Builder to drop a wall on the tile ahead of it.
     * @returns {boolean} True if a wall was created.
     */
    dropWall() {
        return this.builder ? this.builder.dropWall() : false;
    }

    /**
     * Force the baby to be born now (if not already), wherever Ms. Pac-Man is.
     * @returns {boolean} True if a baby was spawned.
     */
    forceBaby() {
        if (this.baby || !this.pacmanMan) return false;
        this._spawnBaby();
        return true;
    }

    /**
     * Freeze a character for the rules-defined duration (5s).
     * @param {'woman'|'man'|'baby'} who - Which character.
     * @returns {boolean} True if applied.
     */
    freeze(who) {
        return this._immobilize(who, 'frozen', 5);
    }

    /**
     * Imprison a character for the rules-defined duration (15s).
     * @param {'woman'|'man'|'baby'} who - Which character.
     * @returns {boolean} True if applied.
     */
    imprison(who) {
        return this._immobilize(who, 'imprisoned', 15);
    }

    /**
     * Snapshot of the rules-layer state, for the test page HUD.
     * @returns {Object}
     */
    getRulesState() {
        const label = c => {
            if (c === this.pacman) return 'Ms Pac-Man';
            if (c === this.pacmanMan) return 'Pac-Man Homme';
            if (c === this.baby) return 'Bébé';
            return '?';
        };

        return {
            config : this.rules.getSummary().configuration,
            builder : {
                ready : this.builder ? this.builder.canDropWall() : false,
                activeWalls : this.builder ? this.builder.activeWallCount() : 0
            },
            baby : { born : !!this.baby },
            effects : [...this._effects.entries()].map(([c, e]) => ({
                who : label(c),
                type : e.type,
                remaining : Math.max(0, e.timer.time - e.timer.getElapsed() / 1000).toFixed(1)
            }))
        };
    }

    // ======================= internals =======================

    /**
     * Options block for a Pac-Man, mirrors the one `Game.js#makeLevel` builds.
     * @private
     */
    _pacmanAttrs() {
        return {
            preturn : true,
            ...this.model.getSettings('pacman'),
            map : this.map,
            factor : this.scaling.getFactor(),
            normalizeRefreshRate : this.normalizeRefreshRate.bind(this),
            addGameGhostEatEventListener : listener => this.on('game:ghost:eat', listener),
            addGameGhostModeFrightenedEnter : listener => this.on('game:ghost:modefrightened:enter', listener),
            addGameGhostModeFrightenedExit : listener => this.on('game:ghost:modefrightened:exit', listener)
        };
    }

    /**
     * Options block for a ghost, mirrors the one `Game.js#makeLevel` builds.
     * @private
     */
    _ghostAttrs() {
        return {
            ...this.model.getSettings('ghost'),
            map : this.map,
            normalizeRefreshRate : this.normalizeRefreshRate.bind(this),
            factor : this.scaling.getFactor(),
            addGameGlobalModeEventListener : listener => this.on('game:globalmode', listener),
            addGameGhostEatenEventListener : listener => this.on('game:ghost:eaten', listener),
            getPacmanData : () => this.pacman.getPositionData(),
            addPacmanEatPillEventListener : listener => this.pacman.on('item:eatpill', listener)
        };
    }

    /**
     * Swap the orange ghost (Sue) for the Builder, keeping the `this.sue`
     * reference so the base game keeps managing it like any ghost.
     * @private
     */
    _replaceSueWithBuilder() {
        const sueTile = this.map.houseCenter.getR().getR();

        this.sue.destroy();
        this.sue = makeBuilder({
            ...this._ghostAttrs(),
            x : sueTile.x + 16,
            y : sueTile.y
        });

        this.addEventListenersToGhost(this.sue);
        this.addSprite(this.sue);

        this.builder = this.sue;
    }

    /**
     * Add the second player next to Ms. Pac-Man.
     * @private
     */
    _addPacmanMan() {
        this.pacmanMan = makePacmanMan({
            ...this._pacmanAttrs(),
            x : 452,
            y : 848
        });
        this.addSprite(this.pacmanMan);
    }

    /**
     * Spawn the baby where Ms. Pac-Man stands; it then follows the nearest parent.
     * @private
     */
    _spawnBaby() {
        const tile = this.pacman.getTile();

        this.baby = makePacmanBaby({
            ...this._pacmanAttrs(),
            x : tile.x,
            y : tile.y,
            getFollowTarget : () => this._nearestParentTile()
        });

        this.addSprite(this.baby);
    }

    /**
     * @private
     * @returns {Tile} Tile of whichever parent is closest to the baby.
     */
    _nearestParentTile() {
        const dist = c => (c.x - this.baby.x) ** 2 + (c.y - this.baby.y) ** 2;
        return dist(this.pacman) <= dist(this.pacmanMan)
            ? this.pacman.getTile()
            : this.pacmanMan.getTile();
    }

    /**
     * @private
     * @returns {string|null} Direction from the WASD / ZQSD keys, or null.
     */
    _getManInput() {
        const down = codes => codes.some(code => this.keyboard.keys[code]);
        if (down(MAN_KEYS.up)) return 'u';
        if (down(MAN_KEYS.right)) return 'r';
        if (down(MAN_KEYS.down)) return 'd';
        if (down(MAN_KEYS.left)) return 'l';
        return null;
    }

    /**
     * @private
     * @returns {boolean} Whether both characters sit on the same tile.
     */
    _sameTile(a, b) {
        return !!a && !!b && a.getTile() === b.getTile();
    }

    /**
     * Resolve a `who` string to a character instance.
     * @private
     */
    _character(who) {
        if (who === 'woman') return this.pacman;
        if (who === 'man') return this.pacmanMan;
        if (who === 'baby') return this.baby;
        return null;
    }

    /**
     * Start a timed immobilising effect on a character.
     * @private
     */
    _immobilize(who, type, seconds) {
        const character = this._character(who);
        if (!character) return false;
        this._effects.set(character, { type, timer : new Timer(seconds) });
        return true;
    }

    /**
     * @private
     * @returns {boolean} Whether the character currently has an active effect.
     */
    _isImmobilized(character) {
        const effect = this._effects.get(character);
        return !!effect && !effect.timer.isElapsed();
    }

    /**
     * Drop effects whose timer has elapsed.
     * @private
     */
    _tickEffects() {
        for (const [character, effect] of this._effects) {
            if (effect.timer.isElapsed()) this._effects.delete(character);
        }
    }
}

export default RulesGame;
