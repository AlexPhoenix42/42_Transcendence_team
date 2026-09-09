/**
 * NetworkManager - Gère la synchronisation multijoueur via WebSocket
 * Tous les joueurs se voient en temps réel
 */
class NetworkManager {
    constructor(options) {
        this.roomName = options.roomName || 'default-room';
        this.serverUrl = options.serverUrl || 'ws://localhost:8000';
        this.gameInstance = options.gameInstance;

        this.localPlayerId = null;
        this.remotePlayers = new Map(); // Map<playerId, NetworkPlayer>

        this.gameSocket = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        // Throttle pour limiter les envois
        this.lastPositionSent = 0;
        this.positionSendInterval = 50; // Envoyer toutes les 50ms max
    }

    /**
     * Connecte au serveur WebSocket
     */
    connect() {
        const url = `${this.serverUrl}/ws/game/${this.roomName}/`;

        try {
            this.gameSocket = new WebSocket(url);

            this.gameSocket.onopen = () => {
                console.log('🌐 Connecté au serveur multijoueur');
                this.connected = true;
                this.reconnectAttempts = 0;

                if (this.onConnected) this.onConnected();
            };

            this.gameSocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('Erreur parsing message:', e);
                }
            };

            this.gameSocket.onerror = (error) => {
                console.error('❌ Erreur WebSocket:', error);
            };

            this.gameSocket.onclose = () => {
                console.log('🔌 Déconnecté du serveur');
                this.connected = false;
                this.attemptReconnect();
            };
        } catch (e) {
            console.error('Erreur connexion:', e);
        }
    }

    /**
     * Gère les messages reçus du serveur
     */
    handleMessage(data) {
        switch (data.type) {
            case 'player_joined':
                this.handlePlayerJoined(data);
                break;

            case 'player_left':
                this.handlePlayerLeft(data);
                break;

            case 'position_update':
                this.handlePositionUpdate(data);
                break;

            case 'role_assignment':
                this.handleRoleAssignment(data);
                break;

            case 'game_state':
                this.handleGameState(data);
                break;
        }
    }

    /**
     * Un nouveau joueur rejoint - créer son avatar dans le jeu
     */
    handlePlayerJoined(data) {
        console.log('👤 Joueur rejoint:', data.player_id);

        // Si c'est nous
        if (!this.localPlayerId) {
            this.localPlayerId = data.player_id;
            console.log('✨ Vous êtes le joueur:', this.localPlayerId);
            return;
        }

        // Si c'est un autre joueur
        if (data.player_id !== this.localPlayerId) {
            // Le gameInstance créera le joueur distant
            if (this.gameInstance && this.gameInstance.addRemotePlayer) {
                this.gameInstance.addRemotePlayer(data.player_id);
            }
        }
    }

    /**
     * Un joueur quitte - retirer son avatar
     */
    handlePlayerLeft(data) {
        console.log('👋 Joueur parti:', data.player_id);

        if (this.gameInstance && this.gameInstance.removeRemotePlayer) {
            this.gameInstance.removeRemotePlayer(data.player_id);
        }
    }

    /**
     * Mise à jour position d'un joueur distant
     */
    handlePositionUpdate(data) {
        // Ne pas traiter nos propres mises à jour
        if (data.player_id === this.localPlayerId) return;

        if (this.gameInstance && this.gameInstance.updateRemotePlayer) {
            this.gameInstance.updateRemotePlayer(data.player_id, {
                x: data.position.x,
                y: data.position.y,
                dir: data.direction
            });
        }
    }

    /**
     * Attribution de rôle à un joueur
     */
    handleRoleAssignment(data) {
        console.log('🎭 Rôle assigné:', data.role, 'à', data.player_id);

        if (this.gameInstance && this.gameInstance.setPlayerRole) {
            this.gameInstance.setPlayerRole(data.player_id, data.role, data.metadata);
        }
    }

    /**
     * Synchronisation état complet du jeu
     */
    handleGameState(data) {
        console.log('🎮 État du jeu reçu:', data.state);
        // TODO: Synchroniser l'état complet si nécessaire
    }

    /**
     * Envoie notre position aux autres joueurs (throttled)
     */
    sendPosition(x, y, dir) {
        if (!this.connected) return;

        const now = Date.now();
        if (now - this.lastPositionSent < this.positionSendInterval) {
            return; // Throttle
        }

        this.lastPositionSent = now;

        this.send({
            type: 'position_update',
            position: { x, y },
            direction: dir
        });
    }

    /**
     * Envoie un changement de rôle
     */
    sendRoleChange(role, metadata = {}) {
        this.send({
            type: 'role_assignment',
            role: role,
            metadata: metadata
        });
    }

    /**
     * Envoie un message générique
     */
    send(data) {
        if (this.gameSocket && this.gameSocket.readyState === WebSocket.OPEN) {
            try {
                this.gameSocket.send(JSON.stringify(data));
            } catch (e) {
                console.error('Erreur envoi:', e);
            }
        }
    }

    /**
     * Tentative de reconnexion
     */
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 Reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

            setTimeout(() => {
                this.connect();
            }, 3000);
        } else {
            console.error('❌ Échec de reconnexion');
        }
    }

    /**
     * Déconnexion propre
     */
    disconnect() {
        if (this.gameSocket) {
            this.gameSocket.close();
            this.gameSocket = null;
        }
        this.connected = false;
    }

    /**
     * Statut de connexion
     */
    isConnected() {
        return this.connected;
    }
}

export default NetworkManager;
