/**
 * Friends Manager
 * Manages friend list, search, and invitations
 * Allows players to find and invite friends to games
 */

class FriendsManager {
    /**
     * Creates an instance of FriendsManager.
     * @param {Object} options - Configuration options
     * @param {string} options.userId - Current user ID
     * @param {Function} options.onFriendAdded - Callback when friend is added
     * @param {Function} options.onFriendRemoved - Callback when friend is removed
     * @param {Function} options.onInvitationSent - Callback when invitation is sent
     */
    constructor(options) {
        this.userId = options.userId;
        this.onFriendAdded = options.onFriendAdded || (() => {});
        this.onFriendRemoved = options.onFriendRemoved || (() => {});
        this.onInvitationSent = options.onInvitationSent || (() => {});

        // Mock database of users
        this.userDatabase = this._initializeUserDatabase();

        // User's friends list
        this.friends = new Map();

        // Pending invitations sent
        this.sentInvitations = new Map();

        // Pending invitations received
        this.receivedInvitations = new Map();

        // Blocked users
        this.blockedUsers = new Set();
    }

    /**
     * Initialize mock user database.
     * @private
     * @returns {Map} Map of user ID to user object
     */
    _initializeUserDatabase() {
        const database = new Map();

        const mockUsers = [
            { id: 'user_001', name: 'Pac-Man Master', level: 45, wins: 150 },
            { id: 'user_002', name: 'Ghost Hunter', level: 38, wins: 95 },
            { id: 'user_003', name: 'Speed Racer', level: 52, wins: 200 },
            { id: 'user_004', name: 'Maze Runner', level: 32, wins: 75 },
            { id: 'user_005', name: 'Pro Player', level: 60, wins: 300 },
            { id: 'user_006', name: 'Night Owl', level: 28, wins: 45 },
            { id: 'user_007', name: 'Champion', level: 55, wins: 250 },
            { id: 'user_008', name: 'Casual Gamer', level: 15, wins: 20 },
            { id: 'user_009', name: 'Legend', level: 99, wins: 500 },
            { id: 'user_010', name: 'New Player', level: 5, wins: 2 }
        ];

        mockUsers.forEach(user => {
            database.set(user.id, {
                ...user,
                isOnline: Math.random() > 0.3, // 70% online
                lastSeen: Date.now() - Math.random() * 3600000,
                status: Math.random() > 0.5 ? 'in_game' : 'in_lobby'
            });
        });

        return database;
    }

    /**
     * Search for users by name or ID.
     * @param {string} query - Search query (minimum 2 characters)
     * @param {Object} options - Search options
     * @param {number} [options.limit=10] - Maximum results to return
     * @param {boolean} [options.onlineOnly=false] - Only return online users
     * @returns {Array} Array of matching users
     */
    search(query, options = {}) {
        const { limit = 10, onlineOnly = false } = options;

        if (!query || query.length < 2) {
            return { success: false, error: 'Query must be at least 2 characters', results: [] };
        }

        const queryLower = query.toLowerCase();
        const results = [];

        for (const [id, user] of this.userDatabase) {
            // Skip self
            if (id === this.userId) continue;

            // Skip already friends
            if (this.friends.has(id)) continue;

            // Skip blocked users
            if (this.blockedUsers.has(id)) continue;

            // Check if name or ID matches
            if (user.name.toLowerCase().includes(queryLower) ||
                id.toLowerCase().includes(queryLower)) {

                if (onlineOnly && !user.isOnline) continue;

                results.push({
                    ...user,
                    isFriend: this.friends.has(id),
                    isBlocked: this.blockedUsers.has(id),
                    invitationPending: this.sentInvitations.has(id)
                });

                if (results.length >= limit) break;
            }
        }

        return { success: true, results: results, total: results.length };
    }

    /**
     * Autocomplete search with minimum character requirement.
     * @param {string} query - Partial search query
     * @param {number} minChars - Minimum characters required (default: 2)
     * @returns {Array} Autocomplete suggestions
     */
    autocomplete(query, minChars = 2) {
        if (!query || query.length < minChars) {
            return [];
        }

        const suggestions = [];
        const queryLower = query.toLowerCase();

        for (const [id, user] of this.userDatabase) {
            if (id === this.userId) continue;
            if (this.friends.has(id)) continue;
            if (this.blockedUsers.has(id)) continue;

            // Check if name starts with query
            if (user.name.toLowerCase().startsWith(queryLower)) {
                suggestions.push({
                    id: user.id,
                    name: user.name,
                    level: user.level,
                    isOnline: user.isOnline
                });
            }

            if (suggestions.length >= 5) break;
        }

        return suggestions;
    }

    /**
     * Send friend request invitation.
     * @param {string} targetUserId - ID of user to invite
     * @returns {Object} Result object
     */
    sendInvitation(targetUserId) {
        // Validate target
        if (!this.userDatabase.has(targetUserId)) {
            return { success: false, error: 'User not found' };
        }

        if (this.friends.has(targetUserId)) {
            return { success: false, error: 'Already friends' };
        }

        if (this.sentInvitations.has(targetUserId)) {
            return { success: false, error: 'Invitation already sent' };
        }

        if (this.blockedUsers.has(targetUserId)) {
            return { success: false, error: 'User is blocked' };
        }

        const invitation = {
            from: this.userId,
            to: targetUserId,
            sentAt: Date.now(),
            status: 'pending'
        };

        this.sentInvitations.set(targetUserId, invitation);

        this.onInvitationSent({
            targetUserId: targetUserId,
            targetName: this.userDatabase.get(targetUserId).name,
            message: `Invitation sent to ${this.userDatabase.get(targetUserId).name}`
        });

        return {
            success: true,
            message: `Invitation sent to ${this.userDatabase.get(targetUserId).name}`,
            invitation: invitation
        };
    }

    /**
     * Accept a friend invitation.
     * @param {string} senderUserId - ID of user who sent invitation
     * @returns {Object} Result object
     */
    acceptInvitation(senderUserId) {
        if (!this.receivedInvitations.has(senderUserId)) {
            return { success: false, error: 'Invitation not found' };
        }

        const invitation = this.receivedInvitations.get(senderUserId);
        const friend = this.userDatabase.get(senderUserId);

        // Add as friend
        this.friends.set(senderUserId, {
            id: senderUserId,
            name: friend.name,
            level: friend.level,
            addedAt: Date.now(),
            status: friend.status
        });

        // Remove invitation
        this.receivedInvitations.delete(senderUserId);

        this.onFriendAdded({
            friendId: senderUserId,
            friendName: friend.name,
            message: `${friend.name} is now your friend!`
        });

        return { success: true, message: `${friend.name} added to friends` };
    }

    /**
     * Decline a friend invitation.
     * @param {string} senderUserId - ID of user who sent invitation
     * @returns {Object} Result object
     */
    declineInvitation(senderUserId) {
        if (!this.receivedInvitations.has(senderUserId)) {
            return { success: false, error: 'Invitation not found' };
        }

        const friend = this.userDatabase.get(senderUserId);
        this.receivedInvitations.delete(senderUserId);

        return { success: true, message: `Invitation from ${friend.name} declined` };
    }

    /**
     * Remove a friend.
     * @param {string} friendId - ID of friend to remove
     * @returns {Object} Result object
     */
    removeFriend(friendId) {
        if (!this.friends.has(friendId)) {
            return { success: false, error: 'Friend not found' };
        }

        const friend = this.friends.get(friendId);
        this.friends.delete(friendId);

        this.onFriendRemoved({
            friendId: friendId,
            friendName: friend.name,
            message: `${friend.name} removed from friends`
        });

        return { success: true, message: `${friend.name} removed from friends` };
    }

    /**
     * Block a user.
     * @param {string} userId - ID of user to block
     * @returns {Object} Result object
     */
    blockUser(userId) {
        if (this.blockedUsers.has(userId)) {
            return { success: false, error: 'User already blocked' };
        }

        this.blockedUsers.add(userId);

        // Remove from friends if exists
        if (this.friends.has(userId)) {
            this.friends.delete(userId);
        }

        const user = this.userDatabase.get(userId);
        return { success: true, message: `${user.name} has been blocked` };
    }

    /**
     * Unblock a user.
     * @param {string} userId - ID of user to unblock
     * @returns {Object} Result object
     */
    unblockUser(userId) {
        if (!this.blockedUsers.has(userId)) {
            return { success: false, error: 'User is not blocked' };
        }

        this.blockedUsers.delete(userId);
        const user = this.userDatabase.get(userId);
        return { success: true, message: `${user.name} has been unblocked` };
    }

    /**
     * Get all friends.
     * @param {Object} options - Filter options
     * @param {boolean} [options.onlineOnly=false] - Only return online friends
     * @returns {Array} Array of friend objects
     */
    getFriends(options = {}) {
        const { onlineOnly = false } = options;

        return Array.from(this.friends.values())
            .filter(friend => {
                if (onlineOnly) {
                    const user = this.userDatabase.get(friend.id);
                    return user && user.isOnline;
                }
                return true;
            })
            .sort((a, b) => b.addedAt - a.addedAt);
    }

    /**
     * Get pending invitations sent.
     * @returns {Array} Array of pending invitations
     */
    getSentInvitations() {
        const pending = [];
        for (const [userId, invitation] of this.sentInvitations) {
            const user = this.userDatabase.get(userId);
            if (user) {
                pending.push({
                    ...invitation,
                    userName: user.name,
                    userLevel: user.level
                });
            }
        }
        return pending;
    }

    /**
     * Get pending invitations received.
     * @returns {Array} Array of received invitations
     */
    getReceivedInvitations() {
        const pending = [];
        for (const [userId, invitation] of this.receivedInvitations) {
            const user = this.userDatabase.get(userId);
            if (user) {
                pending.push({
                    ...invitation,
                    userName: user.name,
                    userLevel: user.level,
                    userStatus: user.status
                });
            }
        }
        return pending;
    }

    /**
     * Get blocked users list.
     * @returns {Array} Array of blocked user objects
     */
    getBlockedUsers() {
        const blocked = [];
        for (const userId of this.blockedUsers) {
            const user = this.userDatabase.get(userId);
            if (user) {
                blocked.push(user);
            }
        }
        return blocked;
    }

    /**
     * Get user profile.
     * @param {string} userId - User ID
     * @returns {Object} User profile or null if not found
     */
    getUserProfile(userId) {
        return this.userDatabase.get(userId) || null;
    }

    /**
     * Invite friend to join a game/lobby.
     * @param {string} friendId - Friend ID
     * @param {string} lobbyId - Lobby ID to invite to
     * @returns {Object} Result object
     */
    inviteToGame(friendId, lobbyId) {
        if (!this.friends.has(friendId)) {
            return { success: false, error: 'Friend not found' };
        }

        const friend = this.friends.get(friendId);
        const user = this.userDatabase.get(friendId);

        // In a real app, send via WebSocket/API
        return {
            success: true,
            message: `Invitation sent to ${friend.name} to join lobby ${lobbyId}`,
            notification: {
                type: 'game_invitation',
                from: this.userId,
                fromName: 'You',
                to: friendId,
                lobbyId: lobbyId,
                timestamp: Date.now()
            }
        };
    }

    /**
     * Get friends management summary.
     * @returns {Object} Summary of friends manager state
     */
    getSummary() {
        return {
            friendsCount: this.friends.size,
            sentInvitations: this.sentInvitations.size,
            receivedInvitations: this.receivedInvitations.size,
            blockedCount: this.blockedUsers.size,
            friends: this.getFriends(),
            sentInvitations: this.getSentInvitations(),
            receivedInvitations: this.getReceivedInvitations(),
            onlineFriends: this.getFriends({ onlineOnly: true }).length
        };
    }

    /**
     * Get debug information.
     * @returns {Object} Debug info
     */
    getDebugInfo() {
        return {
            summary: this.getSummary(),
            database: {
                totalUsers: this.userDatabase.size,
                onlineUsers: Array.from(this.userDatabase.values()).filter(u => u.isOnline).length
            }
        };
    }
}

export default FriendsManager;
