/**
 * Game Lobby System
 * Manages waiting room for players and spectators
 * Allows participants to join game sessions
 */

class GameLobby {
    /**
     * Creates an instance of GameLobby.
     * @param {Object} options - Configuration options
     * @param {string} options.lobbyId - Unique lobby identifier
     * @param {number} options.maxPlayers - Maximum number of players
     * @param {number} options.maxSpectators - Maximum number of spectators
     * @param {Function} options.onPlayerJoined - Callback when player joins
     * @param {Function} options.onPlayerLeft - Callback when player leaves
     * @param {Function} options.onGameStart - Callback when game starts
     * @param {Function} options.onStatusChange - Callback on status changes
     */
    constructor(options) {
        this.lobbyId = options.lobbyId || `lobby_${Date.now()}`;
        this.maxPlayers = options.maxPlayers || 2;
        this.maxSpectators = options.maxSpectators || 50;

        // Callbacks
        this.onPlayerJoined = options.onPlayerJoined || (() => {});
        this.onPlayerLeft = options.onPlayerLeft || (() => {});
        this.onGameStart = options.onGameStart || (() => {});
        this.onStatusChange = options.onStatusChange || (() => {});

        // Participants
        this.players = new Map();
        this.spectators = new Map();
        this.waitingList = new Map();

        // Game state
        this.status = 'waiting'; // 'waiting', 'starting', 'playing', 'ended'
        this.createdAt = Date.now();
        this.startedAt = null;
        this.gameConfig = {
            numPacmen: 1,
            numGhosts: 1,
            difficulty: 'normal'
        };

        // Settings
        this.autoStart = false;
        this.autoStartDelay = 5000; // 5 seconds
        this.countdownTimer = null;
    }

    /**
     * Join as a player.
     * @param {string} userId - Unique user identifier
     * @param {string} userName - Display name
     * @param {string} role - 'pacman' or 'ghost'
     * @returns {Object} Join result
     */
    joinAsPlayer(userId, userName, role = 'pacman') {
        // Check if already in lobby
        if (this.players.has(userId)) {
            return { success: false, error: 'Already joined as player' };
        }

        if (this.spectators.has(userId)) {
            return { success: false, error: 'Already joined as spectator' };
        }

        // Check player limit
        if (this.players.size >= this.maxPlayers) {
            // Add to waiting list instead
            return this._addToWaitingList(userId, userName);
        }

        // Validate role
        if (!['pacman', 'ghost'].includes(role)) {
            return { success: false, error: 'Invalid role' };
        }

        const player = {
            id: userId,
            name: userName,
            role: role,
            joinedAt: Date.now(),
            status: 'ready',
            isReady: false
        };

        this.players.set(userId, player);

        this.onPlayerJoined({
            type: 'player',
            player: player
        });

        this.onStatusChange({
            type: 'player_joined',
            message: `${userName} joined as ${role}`,
            lobbyStatus: this.getStatus()
        });

        return { success: true, player: player };
    }

    /**
     * Join as a spectator.
     * @param {string} userId - Unique user identifier
     * @param {string} userName - Display name
     * @returns {Object} Join result
     */
    joinAsSpectator(userId, userName) {
        // Check if already in lobby
        if (this.players.has(userId)) {
            return { success: false, error: 'Already joined as player' };
        }

        if (this.spectators.has(userId)) {
            return { success: false, error: 'Already joined as spectator' };
        }

        // Check spectator limit
        if (this.spectators.size >= this.maxSpectators) {
            return { success: false, error: 'Spectator limit reached' };
        }

        const spectator = {
            id: userId,
            name: userName,
            joinedAt: Date.now(),
            status: 'watching'
        };

        this.spectators.set(userId, spectator);

        this.onStatusChange({
            type: 'spectator_joined',
            message: `${userName} joined as spectator`,
            lobbyStatus: this.getStatus()
        });

        return { success: true, spectator: spectator };
    }

    /**
     * Add user to waiting list.
     * @private
     * @param {string} userId - User ID
     * @param {string} userName - User name
     * @returns {Object} Result object
     */
    _addToWaitingList(userId, userName) {
        if (this.waitingList.has(userId)) {
            return { success: false, error: 'Already in waiting list' };
        }

        // Check waiting list limit (queue size)
        if (this.waitingList.size >= 20) {
            return { success: false, error: 'Waiting list is full' };
        }

        const waiting = {
            id: userId,
            name: userName,
            addedAt: Date.now(),
            position: this.waitingList.size + 1
        };

        this.waitingList.set(userId, waiting);

        this.onStatusChange({
            type: 'user_waiting',
            message: `${userName} added to waiting list (Position: ${waiting.position})`,
            lobbyStatus: this.getStatus()
        });

        return { success: true, waiting: waiting, message: `Added to waiting list - Position: ${waiting.position}` };
    }

    /**
     * Remove a player from the lobby.
     * @param {string} userId - User ID
     * @returns {Object} Result object
     */
    removePlayer(userId) {
        let removed = null;

        if (this.players.has(userId)) {
            removed = this.players.get(userId);
            this.players.delete(userId);

            this.onPlayerLeft({
                type: 'player',
                player: removed
            });

            this.onStatusChange({
                type: 'player_left',
                message: `${removed.name} left the game`,
                lobbyStatus: this.getStatus()
            });

            // Promote from waiting list if available
            this._promoteFromWaitingList();

            return { success: true, removed: removed };
        }

        if (this.spectators.has(userId)) {
            removed = this.spectators.get(userId);
            this.spectators.delete(userId);

            this.onStatusChange({
                type: 'spectator_left',
                message: `${removed.name} left spectating`,
                lobbyStatus: this.getStatus()
            });

            return { success: true, removed: removed };
        }

        if (this.waitingList.has(userId)) {
            removed = this.waitingList.get(userId);
            this.waitingList.delete(userId);
            this._updateWaitingListPositions();

            return { success: true, removed: removed };
        }

        return { success: false, error: 'User not found in lobby' };
    }

    /**
     * Promote first user from waiting list to player.
     * @private
     */
    _promoteFromWaitingList() {
        if (this.waitingList.size === 0 || this.players.size >= this.maxPlayers) {
            return;
        }

        // Get first in waiting list
        const firstWaiting = Array.from(this.waitingList.values())[0];
        this.waitingList.delete(firstWaiting.id);

        // Promote to player
        const player = {
            id: firstWaiting.id,
            name: firstWaiting.name,
            role: 'pacman', // Default role
            joinedAt: Date.now(),
            status: 'ready',
            isReady: false
        };

        this.players.set(firstWaiting.id, player);
        this._updateWaitingListPositions();

        this.onStatusChange({
            type: 'user_promoted',
            message: `${firstWaiting.name} promoted from waiting list to player`,
            lobbyStatus: this.getStatus()
        });
    }

    /**
     * Update positions in waiting list.
     * @private
     */
    _updateWaitingListPositions() {
        let position = 1;
        for (const waiting of this.waitingList.values()) {
            waiting.position = position++;
        }
    }

    /**
     * Mark player as ready.
     * @param {string} userId - User ID
     * @returns {Object} Result object
     */
    playerReady(userId) {
        if (!this.players.has(userId)) {
            return { success: false, error: 'User is not a player' };
        }

        const player = this.players.get(userId);
        player.isReady = true;
        player.status = 'ready';

        this.onStatusChange({
            type: 'player_ready',
            message: `${player.name} is ready`,
            lobbyStatus: this.getStatus()
        });

        // Check if all players are ready
        if (this._allPlayersReady() && this.autoStart) {
            this.startCountdown();
        }

        return { success: true, player: player };
    }

    /**
     * Mark player as not ready.
     * @param {string} userId - User ID
     * @returns {Object} Result object
     */
    playerNotReady(userId) {
        if (!this.players.has(userId)) {
            return { success: false, error: 'User is not a player' };
        }

        const player = this.players.get(userId);
        player.isReady = false;
        player.status = 'not_ready';

        this.onStatusChange({
            type: 'player_not_ready',
            message: `${player.name} is not ready`,
            lobbyStatus: this.getStatus()
        });

        this._cancelCountdown();

        return { success: true, player: player };
    }

    /**
     * Check if all players are ready.
     * @private
     * @returns {boolean} True if all players are ready
     */
    _allPlayersReady() {
        if (this.players.size === 0) return false;
        for (const player of this.players.values()) {
            if (!player.isReady) return false;
        }
        return true;
    }

    /**
     * Start countdown to game start.
     * @param {number} delay - Delay in milliseconds
     */
    startCountdown(delay = this.autoStartDelay) {
        if (this.countdownTimer !== null) {
            return; // Already counting down
        }

        this.status = 'starting';
        let remaining = Math.floor(delay / 1000);

        this.onStatusChange({
            type: 'countdown_start',
            message: `Game starting in ${remaining}s`,
            remaining: remaining,
            lobbyStatus: this.getStatus()
        });

        const interval = setInterval(() => {
            remaining--;

            if (remaining <= 0) {
                clearInterval(interval);
                this.countdownTimer = null;
                this.startGame();
            } else {
                this.onStatusChange({
                    type: 'countdown_tick',
                    message: `Game starting in ${remaining}s`,
                    remaining: remaining,
                    lobbyStatus: this.getStatus()
                });
            }
        }, 1000);

        this.countdownTimer = interval;
    }

    /**
     * Cancel countdown.
     * @private
     */
    _cancelCountdown() {
        if (this.countdownTimer !== null) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
            this.status = 'waiting';

            this.onStatusChange({
                type: 'countdown_cancelled',
                message: 'Game start cancelled',
                lobbyStatus: this.getStatus()
            });
        }
    }

    /**
     * Manually start the game.
     * @returns {Object} Result object
     */
    startGame() {
        if (this.players.size === 0) {
            return { success: false, error: 'No players in lobby' };
        }

        this.status = 'playing';
        this.startedAt = Date.now();

        const gameSession = {
            lobbyId: this.lobbyId,
            players: Array.from(this.players.values()),
            spectators: Array.from(this.spectators.values()),
            gameConfig: this.gameConfig,
            startedAt: this.startedAt
        };

        this.onGameStart(gameSession);

        this.onStatusChange({
            type: 'game_started',
            message: 'Game started!',
            gameSession: gameSession,
            lobbyStatus: this.getStatus()
        });

        return { success: true, gameSession: gameSession };
    }

    /**
     * End the game.
     */
    endGame() {
        this.status = 'ended';

        this.onStatusChange({
            type: 'game_ended',
            message: 'Game ended',
            lobbyStatus: this.getStatus()
        });
    }

    /**
     * Update game configuration.
     * @param {Object} config - Configuration object
     * @returns {Object} Result object
     */
    updateConfig(config) {
        if (this.status !== 'waiting') {
            return { success: false, error: 'Cannot change config while game is running' };
        }

        this.gameConfig = {
            ...this.gameConfig,
            ...config
        };

        this.onStatusChange({
            type: 'config_updated',
            message: 'Game configuration updated',
            config: this.gameConfig,
            lobbyStatus: this.getStatus()
        });

        return { success: true, config: this.gameConfig };
    }

    /**
     * Get lobby status.
     * @returns {Object} Current lobby status
     */
    getStatus() {
        return {
            lobbyId: this.lobbyId,
            status: this.status,
            playerCount: this.players.size,
            spectatorCount: this.spectators.size,
            waitingCount: this.waitingList.size,
            maxPlayers: this.maxPlayers,
            maxSpectators: this.maxSpectators,
            players: Array.from(this.players.values()),
            spectators: Array.from(this.spectators.values()),
            waitingList: Array.from(this.waitingList.values()),
            createdAt: this.createdAt,
            startedAt: this.startedAt,
            gameConfig: this.gameConfig,
            allPlayersReady: this._allPlayersReady(),
            canStart: this.players.size > 0 && this._allPlayersReady()
        };
    }

    /**
     * Get waiting list.
     * @returns {Array} Waiting list array
     */
    getWaitingList() {
        return Array.from(this.waitingList.values());
    }

    /**
     * Get debug information.
     * @returns {Object} Debug info
     */
    getDebugInfo() {
        return {
            lobbyId: this.lobbyId,
            status: this.getStatus(),
            countdownActive: this.countdownTimer !== null,
            createdAt: new Date(this.createdAt).toLocaleString(),
            uptime: `${Math.floor((Date.now() - this.createdAt) / 1000)}s`
        };
    }
}

export default GameLobby;
