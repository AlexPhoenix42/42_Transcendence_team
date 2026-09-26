/**
 * Game Rules Integration Helper
 * Provides practical methods to integrate GameRules with existing game components
 */

import GameRules, {
    PACMAN_TYPE_NORMAL,
    PACMAN_TYPE_INVINCIBLE,
    GHOST_TYPE_WALL_MAKER,
    GHOST_TYPE_KILLER,
    GHOST_TYPE_BLOCKER,
    GHOST_TYPE_FREEZER,
    STATE_FROZEN,
    STATE_IMPRISONED
} from './GameRules.js';

class GameRulesIntegration {
    /**
     * Creates an instance of GameRulesIntegration.
     * @param {GameModel} gameModel - Reference to the game model
     * @param {Array} pacmen - Array of Pac-Man objects
     * @param {Array} ghosts - Array of Ghost objects
     */
    constructor(gameModel, pacmen, ghosts) {
        this.gameModel = gameModel;
        this.pacmen = pacmen;
        this.ghosts = ghosts;

        // Initialize rules based on player count
        const numPacmen = pacmen.length;
        const numGhosts = ghosts.length;
        this.gameRules = new GameRules(numPacmen, numGhosts);

        // Initialize state tracking for all entities
        this._initializeEntityStates();

        // Bind event listeners
        this._setupEventListeners();
    }

    /**
     * Initialize state tracking for all Pac-Men and Ghosts.
     * @private
     */
    _initializeEntityStates() {
        this.pacmen.forEach((pacman, index) => {
            const state = this.gameRules.getPacmanState(pacman.id || `pacman_${index}`, index);
            pacman._gameRulesState = state;
            pacman._originalCanGo = pacman.canGo;
        });

        this.ghosts.forEach((ghost, index) => {
            const state = this.gameRules.getGhostState(ghost.id || `ghost_${index}`, index);
            ghost._gameRulesState = state;
        });
    }

    /**
     * Setup event listeners for game events.
     * @private
     */
    _setupEventListeners() {
        // Listen to Pac-Man grain eating
        this.pacmen.forEach((pacman, index) => {
            pacman.on('item:eat', () => {
                if (!this.gameRules.canEatGrains(index)) {
                    // Prevent grain eating for invincible Pac-Man
                    return;
                }
            });

            pacman.on('item:tile', () => {
                this._updatePacmanState(pacman, index);
            });
        });

        // Listen to ghost interactions
        this.ghosts.forEach((ghost, index) => {
            ghost.on('item:eat', () => {
                // Ghost ate Pac-Man - check if allowed
                this._handleGhostEatPacman(ghost, index);
            });
        });
    }

    /**
     * Update Pac-Man state (frozen, imprisoned, etc).
     * @private
     * @param {Object} pacman - Pac-Man object
     * @param {number} index - Pac-Man index
     */
    _updatePacmanState(pacman, index) {
        const pacmanId = pacman.id || `pacman_${index}`;

        // Check if imprisoned
        if (this.gameRules.isPacmanImprisoned(pacmanId)) {
            if (pacman.canGo !== this._restrictedCanGo) {
                pacman.canGo = this._restrictedCanGo;
            }
        } else if (this.gameRules.isPacmanFrozen(pacmanId)) {
            // Pac-Man is frozen, cannot move
            if (pacman.canGo !== this._restrictedCanGo) {
                pacman.canGo = this._restrictedCanGo;
            }
        } else {
            // Restore normal movement
            if (this.gameRules.isInvincible(index)) {
                pacman.canGo = this._invincibleCanGo;
            } else {
                pacman.canGo = pacman._originalCanGo;
            }
        }
    }

    /**
     * Restricted canGo function - prevents all movement.
     * @private
     */
    _restrictedCanGo(dir) {
        return false; // Cannot move anywhere
    }

    /**
     * Invincible canGo function - allows passing through walls.
     * @private
     */
    _invincibleCanGo(dir) {
        const tile = this.getTile();
        const nextTile = tile.get(dir);

        return nextTile && !nextTile.isHouse();
        // Can pass through walls - only blocked by house
    }

    /**
     * Handle ghost eating Pac-Man.
     * @private
     * @param {Object} ghost - Ghost object
     * @param {number} ghostIndex - Ghost index
     */
    _handleGhostEatPacman(ghost, ghostIndex) {
        // Find which Pac-Man was eaten
        this.pacmen.forEach((pacman, pacmanIndex) => {
            const pacmanId = pacman.id || `pacman_${pacmanIndex}`;
            const collision = this.gameRules.handleGhostPacmanCollision(ghostIndex, pacmanId);

            if (collision.result !== 'none') {
                this._processCollision(pacman, ghost, collision, pacmanIndex, ghostIndex);
            }
        });
    }

    /**
     * Process collision between ghost and Pac-Man.
     * @private
     * @param {Object} pacman - Pac-Man object
     * @param {Object} ghost - Ghost object
     * @param {Object} collision - Collision result from gameRules
     * @param {number} pacmanIndex - Pac-Man index
     * @param {number} ghostIndex - Ghost index
     */
    _processCollision(pacman, ghost, collision, pacmanIndex, ghostIndex) {
        const pacmanId = pacman.id || `pacman_${pacmanIndex}`;

        switch(collision.result) {
            case 'death':
                this._handlePacmanDeath(pacman, pacmanIndex);
                break;

            case 'blocked':
                this._handlePacmanBlocked(pacman, pacmanIndex);
                break;

            case 'frozen':
                this._handlePacmanFrozen(pacman, pacmanIndex);
                break;

            case 'immune':
                // No effect - Pac-Man is invincible
                break;
        }

        console.log(`[Collision] ${collision.message}`);
    }

    /**
     * Handle Pac-Man death.
     * @private
     * @param {Object} pacman - Pac-Man object
     * @param {number} pacmanIndex - Pac-Man index
     */
    _handlePacmanDeath(pacman, pacmanIndex) {
        // Only normal Pac-Man dies
        if (!this.gameRules.isInvincible(pacmanIndex)) {
            pacman.die();
            this.gameModel.lives--;
            if (this.gameModel.lives <= 0) {
                this.gameModel.status = 'gameOver';
            }
        }
    }

    /**
     * Handle Pac-Man being blocked.
     * @private
     * @param {Object} pacman - Pac-Man object
     * @param {number} pacmanIndex - Pac-Man index
     */
    _handlePacmanBlocked(pacman, pacmanIndex) {
        // Stop Pac-Man temporarily
        pacman._speed = 0;
        setTimeout(() => {
            pacman._speed = pacman.speed;
        }, 500); // Stop for 500ms
    }

    /**
     * Handle Pac-Man being frozen.
     * @private
     * @param {Object} pacman - Pac-Man object
     * @param {number} pacmanIndex - Pac-Man index
     */
    _handlePacmanFrozen(pacman, pacmanIndex) {
        // Pac-Man cannot move for 5 seconds
        const pacmanId = pacman.id || `pacman_${pacmanIndex}`;
        console.log(`Pac-Man ${pacmanIndex} frozen for 5 seconds!`);
        // UI should show freeze effect
        if (pacman.showFrozenEffect) {
            pacman.showFrozenEffect();
        }
    }

    /**
     * Update game state (called each frame).
     */
    update() {
        // Update Pac-Man states
        this.pacmen.forEach((pacman, index) => {
            this._updatePacmanState(pacman, index);
        });

        // Update Ghost recharge states
        this.ghosts.forEach((ghost, index) => {
            const ghostId = ghost.id || `ghost_${index}`;
            if (this.gameRules.updateGhostRecharge(ghostId)) {
                if (ghost.showReadyEffect) {
                    ghost.showReadyEffect(); // Ghost is ready to freeze again
                }
            }
        });
    }

    /**
     * Activate wall creation for wall-maker ghost.
     * @param {number} ghostIndex - Index of the ghost
     */
    activateWallCreation(ghostIndex) {
        const ghostId = this.ghosts[ghostIndex].id || `ghost_${ghostIndex}`;
        const result = this.gameRules.activateWallCreation(ghostId);

        if (result.success) {
            console.log(`Wall creation activated for ${result.duration} seconds`);
            // Trigger wall creation visuals
            if (this.ghosts[ghostIndex].activateWallCreation) {
                this.ghosts[ghostIndex].activateWallCreation();
            }
        }

        return result;
    }

    /**
     * Freeze a Pac-Man (freezer ghost ability).
     * @param {number} ghostIndex - Index of the ghost (must be freezer)
     * @param {number} pacmanIndex - Index of the Pac-Man to freeze
     */
    activateFreeze(ghostIndex, pacmanIndex) {
        const ghostId = this.ghosts[ghostIndex].id || `ghost_${ghostIndex}`;
        const pacmanId = this.pacmen[pacmanIndex].id || `pacman_${pacmanIndex}`;

        const result = this.gameRules.freezePacman(ghostId, pacmanId);

        if (result.success) {
            console.log(`${result.message}`);
            // Trigger freeze visuals
            if (this.pacmen[pacmanIndex].showFrozenEffect) {
                this.pacmen[pacmanIndex].showFrozenEffect();
            }
            if (this.ghosts[ghostIndex].enterRechargeMode) {
                this.ghosts[ghostIndex].enterRechargeMode(result.rechargeTime);
            }
        }

        return result;
    }

    /**
     * Imprison a Pac-Man.
     * @param {number} pacmanIndex - Index of the Pac-Man
     */
    imprisonPacman(pacmanIndex) {
        const pacmanId = this.pacmen[pacmanIndex].id || `pacman_${pacmanIndex}`;
        const result = this.gameRules.imprisonPacman(pacmanId);

        if (result.success) {
            console.log(`${result.message}`);
            // Trigger prison visuals
            if (this.pacmen[pacmanIndex].enterPrisonMode) {
                this.pacmen[pacmanIndex].enterPrisonMode(result.duration);
            }
        }

        return result;
    }

    /**
     * Get game rules summary.
     * @returns {Object} Game rules summary
     */
    getSummary() {
        return this.gameRules.getSummary();
    }

    /**
     * Get debug info for current game state.
     * @returns {Object} Debug information
     */
    getDebugInfo() {
        return {
            rules: this.gameRules.getSummary(),
            pacmen: this.pacmen.map((p, i) => ({
                index: i,
                type: this.gameRules.getPacmanType(i),
                imprisoned: this.gameRules.isPacmanImprisoned(p.id || `pacman_${i}`),
                frozen: this.gameRules.isPacmanFrozen(p.id || `pacman_${i}`)
            })),
            ghosts: this.ghosts.map((g, i) => ({
                index: i,
                type: this.gameRules.getGhostType(i),
                creatingWalls: this.gameRules.isCreatingWalls(g.id || `ghost_${i}`)
            }))
        };
    }
}

export default GameRulesIntegration;
