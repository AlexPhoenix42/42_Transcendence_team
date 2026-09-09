import Timer from './engine/Timer.js';

/**
 * Pac-Man Player Types
 */
export const PACMAN_TYPE_NORMAL = 'normal';
export const PACMAN_TYPE_INVINCIBLE = 'invincible';

/**
 * Ghost Types (based on game configuration)
 */
export const GHOST_TYPE_WALL_MAKER = 'wallMaker';      // 1 ghost - creates temp walls
export const GHOST_TYPE_KILLER = 'killer';              // 2 ghosts - kills
export const GHOST_TYPE_BLOCKER = 'blocker';            // 3 ghosts - blocks only
export const GHOST_TYPE_FREEZER = 'freezer';            // 4 ghosts - freezes

/**
 * Special States
 */
export const STATE_FROZEN = 'frozen';
export const STATE_IMPRISONED = 'imprisoned';
export const STATE_WALL_CREATION_ACTIVE = 'wallCreationActive';

/**
 * Game Rules Manager
 * Manages player types and special abilities based on game configuration
 * @class GameRules
 */
class GameRules {
    /**
     * Creates an instance of GameRules.
     * @param {number} numPacmen - Number of Pac-Man players (1 or 2)
     * @param {number} numGhosts - Number of ghosts (1, 2, 3, or 4)
     */
    constructor(numPacmen = 1, numGhosts = 1) {
        this.numPacmen = Math.max(1, Math.min(2, numPacmen));
        this.numGhosts = Math.max(1, Math.min(4, numGhosts));

        // Initialize Pac-Man types based on count
        this.pacmanTypes = this._initializePacmanTypes();

        // Initialize Ghost types based on count
        this.ghostTypes = this._initializeGhostTypes();

        // State trackers
        this.pacmanStates = new Map();  // pacmanId -> state object
        this.ghostStates = new Map();   // ghostId -> state object
    }

    /**
     * Initialize Pac-Man player types.
     * @private
     * @returns {Array<string>} Array of Pac-Man types
     */
    _initializePacmanTypes() {
        if (this.numPacmen === 1) {
            return [PACMAN_TYPE_NORMAL];
        } else {
            // 2 Pac-Men: 1st is normal, 2nd is invincible
            return [PACMAN_TYPE_NORMAL, PACMAN_TYPE_INVINCIBLE];
        }
    }

    /**
     * Initialize Ghost types based on count.
     * @private
     * @returns {Array<string>} Array of Ghost types
     */
    _initializeGhostTypes() {
        const types = [];

        switch(this.numGhosts) {
            case 1:
                types.push(GHOST_TYPE_WALL_MAKER);
                break;
            case 2:
                types.push(GHOST_TYPE_KILLER);
                types.push(GHOST_TYPE_KILLER);
                break;
            case 3:
                types.push(GHOST_TYPE_KILLER);
                types.push(GHOST_TYPE_KILLER);
                types.push(GHOST_TYPE_BLOCKER);
                break;
            case 4:
                types.push(GHOST_TYPE_KILLER);
                types.push(GHOST_TYPE_KILLER);
                types.push(GHOST_TYPE_BLOCKER);
                types.push(GHOST_TYPE_FREEZER);
                break;
        }

        return types;
    }

    /**
     * Get Pac-Man type for a specific player.
     * @param {number} pacmanIndex - Index of the Pac-Man player (0 or 1)
     * @returns {string} The Pac-Man type
     */
    getPacmanType(pacmanIndex) {
        return this.pacmanTypes[pacmanIndex] || PACMAN_TYPE_NORMAL;
    }

    /**
     * Get Ghost type for a specific ghost.
     * @param {number} ghostIndex - Index of the ghost (0-3)
     * @returns {string} The ghost type
     */
    getGhostType(ghostIndex) {
        return this.ghostTypes[ghostIndex] || GHOST_TYPE_KILLER;
    }

    /**
     * Check if a Pac-Man is invincible.
     * @param {number} pacmanIndex - Index of the Pac-Man player
     * @returns {boolean} True if invincible
     */
    isInvincible(pacmanIndex) {
        return this.getPacmanType(pacmanIndex) === PACMAN_TYPE_INVINCIBLE;
    }

    /**
     * Check if a Pac-Man can eat grains.
     * @param {number} pacmanIndex - Index of the Pac-Man player
     * @returns {boolean} True if can eat grains
     */
    canEatGrains(pacmanIndex) {
        return this.getPacmanType(pacmanIndex) === PACMAN_TYPE_NORMAL;
    }

    /**
     * Check if a Pac-Man can destroy walls.
     * @param {number} pacmanIndex - Index of the Pac-Man player
     * @returns {boolean} True if can destroy walls
     */
    canDestroyWalls(pacmanIndex) {
        return this.getPacmanType(pacmanIndex) === PACMAN_TYPE_INVINCIBLE;
    }

    /**
     * Check if a Pac-Man can be imprisoned.
     * @param {number} pacmanIndex - Index of the Pac-Man player
     * @returns {boolean} True if can be imprisoned
     */
    canBeImprisoned(pacmanIndex) {
        return this.getPacmanType(pacmanIndex) === PACMAN_TYPE_INVINCIBLE;
    }

    /**
     * Get prison duration for a Pac-Man.
     * @param {number} pacmanIndex - Index of the Pac-Man player
     * @returns {number} Prison duration in seconds
     */
    getPrisonDuration(pacmanIndex) {
        if (this.canBeImprisoned(pacmanIndex)) {
            return 15; // 15 seconds for invincible Pac-Man
        }
        return 0;
    }

    /**
     * Initialize or get state for a Pac-Man player.
     * @param {string} pacmanId - Unique identifier for the Pac-Man
     * @param {number} pacmanIndex - Index of the Pac-Man player
     * @returns {Object} State object for the Pac-Man
     */
    getPacmanState(pacmanId, pacmanIndex) {
        if (!this.pacmanStates.has(pacmanId)) {
            this.pacmanStates.set(pacmanId, {
                id: pacmanId,
                index: pacmanIndex,
                type: this.getPacmanType(pacmanIndex),
                imprisoned: false,
                prisonTimer: null,
                wallDestructionActive: false,
                score: 0
            });
        }
        return this.pacmanStates.get(pacmanId);
    }

    /**
     * Initialize or get state for a Ghost.
     * @param {string} ghostId - Unique identifier for the ghost
     * @param {number} ghostIndex - Index of the ghost (0-3)
     * @returns {Object} State object for the ghost
     */
    getGhostState(ghostId, ghostIndex) {
        if (!this.ghostStates.has(ghostId)) {
            this.ghostStates.set(ghostId, {
                id: ghostId,
                index: ghostIndex,
                type: this.getGhostType(ghostIndex),
                wallCreationActive: false,
                wallCreationTimer: null,
                frozen: false,
                freezeTimer: null,
                chargeTimer: null,
                canFreeze: true
            });
        }
        return this.ghostStates.get(ghostId);
    }

    // ========== PAC-MAN ABILITIES ==========

    /**
     * Imprison a Pac-Man.
     * @param {string} pacmanId - Unique identifier for the Pac-Man
     * @returns {Object} Updated state object
     */
    imprisonPacman(pacmanId) {
        const state = this.pacmanStates.get(pacmanId);
        if (state && this.canBeImprisoned(state.index)) {
            state.imprisoned = true;
            state.prisonTimer = new Timer(this.getPrisonDuration(state.index));
            return {
                success: true,
                duration: this.getPrisonDuration(state.index),
                message: `Pac-Man ${state.index + 1} imprisoned for 15 seconds!`
            };
        }
        return { success: false, message: 'Cannot imprison this Pac-Man' };
    }

    /**
     * Check if a Pac-Man is currently imprisoned.
     * @param {string} pacmanId - Unique identifier for the Pac-Man
     * @returns {boolean} True if imprisoned
     */
    isPacmanImprisoned(pacmanId) {
        const state = this.pacmanStates.get(pacmanId);
        if (!state || !state.imprisoned) return false;

        if (state.prisonTimer && state.prisonTimer.isElapsed()) {
            state.imprisoned = false;
            state.prisonTimer = null;
            return false;
        }

        return state.imprisoned;
    }

    /**
     * Check if a Pac-Man can move (not imprisoned).
     * @param {string} pacmanId - Unique identifier for the Pac-Man
     * @returns {boolean} True if can move
     */
    canPacmanMove(pacmanId) {
        return !this.isPacmanImprisoned(pacmanId);
    }

    /**
     * Get remaining prison time for a Pac-Man.
     * @param {string} pacmanId - Unique identifier for the Pac-Man
     * @returns {number} Remaining time in seconds, or 0 if not imprisoned
     */
    getRemainingPrisonTime(pacmanId) {
        const state = this.pacmanStates.get(pacmanId);
        if (!state || !state.imprisoned || !state.prisonTimer) return 0;

        const elapsed = state.prisonTimer.getElapsedTime();
        const duration = this.getPrisonDuration(state.index);
        return Math.max(0, duration - elapsed);
    }

    // ========== GHOST ABILITIES ==========

    /**
     * Activate wall creation for a ghost (Type 1 only).
     * @param {string} ghostId - Unique identifier for the ghost
     * @returns {Object} Result object
     */
    activateWallCreation(ghostId) {
        const state = this.ghostStates.get(ghostId);
        if (!state || state.type !== GHOST_TYPE_WALL_MAKER) {
            return { success: false, message: 'Only wall-maker ghosts can create walls' };
        }

        if (state.wallCreationActive) {
            return { success: false, message: 'Wall creation already active' };
        }

        state.wallCreationActive = true;
        state.wallCreationTimer = new Timer(10); // 10 seconds

        return {
            success: true,
            duration: 10,
            message: `Wall creation activated for 10 seconds!`
        };
    }

    /**
     * Check if a ghost has active wall creation.
     * @param {string} ghostId - Unique identifier for the ghost
     * @returns {boolean} True if creating walls
     */
    isCreatingWalls(ghostId) {
        const state = this.ghostStates.get(ghostId);
        if (!state || !state.wallCreationActive) return false;

        if (state.wallCreationTimer && state.wallCreationTimer.isElapsed()) {
            state.wallCreationActive = false;
            state.wallCreationTimer = null;
            return false;
        }

        return state.wallCreationActive;
    }

    /**
     * Freeze a Pac-Man (Type 4 ghost only).
     * @param {string} ghostId - Unique identifier for the ghost (must be Type 4)
     * @param {string} pacmanId - Unique identifier for the target Pac-Man
     * @returns {Object} Result object
     */
    freezePacman(ghostId, pacmanId) {
        const ghostState = this.ghostStates.get(ghostId);
        const pacmanState = this.pacmanStates.get(pacmanId);

        if (!ghostState || ghostState.type !== GHOST_TYPE_FREEZER) {
            return { success: false, message: 'Only freezer ghosts can freeze Pac-Men' };
        }

        if (!ghostState.canFreeze) {
            return { success: false, message: 'Ghost needs to recharge before freezing again' };
        }

        if (!pacmanState) {
            return { success: false, message: 'Invalid Pac-Man target' };
        }

        // Freeze Pac-Man for 5 seconds
        pacmanState.frozen = true;
        pacmanState.freezeTimer = new Timer(5);

        // Ghost needs to return to prison to recharge
        ghostState.canFreeze = false;
        ghostState.chargeTimer = new Timer(7); // 7 seconds in prison

        return {
            success: true,
            duration: 5,
            rechargeTime: 7,
            message: `Pac-Man ${pacmanState.index + 1} frozen for 5 seconds! Ghost recharging for 7 seconds.`
        };
    }

    /**
     * Check if a Pac-Man is frozen.
     * @param {string} pacmanId - Unique identifier for the Pac-Man
     * @returns {boolean} True if frozen
     */
    isPacmanFrozen(pacmanId) {
        const state = this.pacmanStates.get(pacmanId);
        if (!state || !state.frozen) return false;

        if (state.freezeTimer && state.freezeTimer.isElapsed()) {
            state.frozen = false;
            state.freezeTimer = null;
            return false;
        }

        return state.frozen;
    }

    /**
     * Update ghost freeze recharge status.
     * @param {string} ghostId - Unique identifier for the ghost
     * @returns {boolean} True if recharging is complete
     */
    updateGhostRecharge(ghostId) {
        const state = this.ghostStates.get(ghostId);
        if (!state || state.canFreeze) return true;

        if (state.chargeTimer && state.chargeTimer.isElapsed()) {
            state.canFreeze = true;
            state.chargeTimer = null;
            return true;
        }

        return false;
    }

    /**
     * Get remaining freeze time for a Pac-Man.
     * @param {string} pacmanId - Unique identifier for the Pac-Man
     * @returns {number} Remaining time in seconds, or 0 if not frozen
     */
    getRemainingFreezeTime(pacmanId) {
        const state = this.pacmanStates.get(pacmanId);
        if (!state || !state.frozen || !state.freezeTimer) return 0;

        const elapsed = state.freezeTimer.getElapsedTime();
        return Math.max(0, 5 - elapsed);
    }

    // ========== INTERACTION RULES ==========

    /**
     * Check if a ghost can kill a Pac-Man.
     * @param {number} ghostIndex - Index of the ghost
     * @returns {boolean} True if the ghost can kill
     */
    canGhostKill(ghostIndex) {
        const type = this.getGhostType(ghostIndex);
        return type === GHOST_TYPE_KILLER;
    }

    /**
     * Check if a ghost can only block (not kill).
     * @param {number} ghostIndex - Index of the ghost
     * @returns {boolean} True if the ghost can only block
     */
    canGhostBlock(ghostIndex) {
        const type = this.getGhostType(ghostIndex);
        return type === GHOST_TYPE_BLOCKER || type === GHOST_TYPE_FREEZER;
    }

    /**
     * Handle collision between ghost and Pac-Man.
     * @param {number} ghostIndex - Index of the ghost
     * @param {string} pacmanId - Unique identifier for the Pac-Man
     * @returns {Object} Collision result
     */
    handleGhostPacmanCollision(ghostIndex, pacmanId) {
        const pacmanState = this.pacmanStates.get(pacmanId);
        if (!pacmanState) {
            return { result: 'invalid', message: 'Invalid Pac-Man' };
        }

        const ghostType = this.getGhostType(ghostIndex);

        // Invincible Pac-Men are immune to ghosts
        if (this.isInvincible(pacmanState.index)) {
            return {
                result: 'immune',
                message: `Pac-Man ${pacmanState.index + 1} is immune!`
            };
        }

        switch(ghostType) {
            case GHOST_TYPE_KILLER:
                return {
                    result: 'death',
                    message: `Pac-Man ${pacmanState.index + 1} killed by ghost!`
                };

            case GHOST_TYPE_BLOCKER:
                return {
                    result: 'blocked',
                    message: `Pac-Man ${pacmanState.index + 1} blocked by ghost!`
                };

            case GHOST_TYPE_FREEZER:
                // Freezer ghosts freeze Pac-Men
                this.freezePacman(`ghost_${ghostIndex}`, pacmanId);
                return {
                    result: 'frozen',
                    message: `Pac-Man ${pacmanState.index + 1} frozen!`
                };

            default:
                return { result: 'none', message: 'No collision effect' };
        }
    }

    // ========== SUMMARY ==========

    /**
     * Get a summary of current game rules.
     * @returns {Object} Summary object
     */
    getSummary() {
        return {
            configuration: {
                numPacmen: this.numPacmen,
                numGhosts: this.numGhosts
            },
            pacmanRules: {
                player1: {
                    type: this.pacmanTypes[0],
                    canEatGrains: this.canEatGrains(0),
                    canDestroyWalls: this.canDestroyWalls(0),
                    canBeImprisoned: this.canBeImprisoned(0),
                    prisonDuration: this.getPrisonDuration(0)
                },
                player2: this.numPacmen > 1 ? {
                    type: this.pacmanTypes[1],
                    canEatGrains: this.canEatGrains(1),
                    canDestroyWalls: this.canDestroyWalls(1),
                    canBeImprisoned: this.canBeImprisoned(1),
                    prisonDuration: this.getPrisonDuration(1)
                } : null
            },
            ghostRules: this.ghostTypes.map((type, index) => ({
                ghostIndex: index,
                type: type,
                abilities: this._getGhostAbilities(type)
            }))
        };
    }

    /**
     * Get abilities for a specific ghost type.
     * @private
     * @param {string} ghostType - The ghost type
     * @returns {Array<string>} List of abilities
     */
    _getGhostAbilities(ghostType) {
        switch(ghostType) {
            case GHOST_TYPE_WALL_MAKER:
                return ['Create temporary walls for 10 seconds'];
            case GHOST_TYPE_KILLER:
                return ['Kill Pac-Men on contact'];
            case GHOST_TYPE_BLOCKER:
                return ['Block Pac-Men on contact (no death)'];
            case GHOST_TYPE_FREEZER:
                return ['Freeze Pac-Men for 5 seconds', 'Requires 7 second prison recharge'];
            default:
                return [];
        }
    }
}

export default GameRules;
