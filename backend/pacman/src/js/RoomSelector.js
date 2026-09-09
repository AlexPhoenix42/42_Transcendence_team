/**
 * RoomSelector - Interface pour créer ou rejoindre des salons de jeu
 * Les joueurs dans le même salon se voient et jouent ensemble
 */
class RoomSelector {
    constructor(options = {}) {
        this.onRoomSelected = options.onRoomSelected || (() => {});
        this.serverUrl = options.serverUrl || 'http://localhost:8000';

        this.currentRoom = null;
        this.availableRooms = [];

        this.render();
        this.fetchRooms();
    }

    /**
     * Récupère la liste des salons disponibles
     */
    async fetchRooms() {
        try {
            const response = await fetch(`${this.serverUrl}/api/rooms/`);
            const data = await response.json();
            this.availableRooms = data.results || data;
            this.updateRoomsList();
        } catch (e) {
            console.error('Erreur récupération salons:', e);
        }
    }

    /**
     * Crée un nouveau salon
     */
    async createRoom(roomName) {
        if (!roomName || roomName.trim().length === 0) {
            alert('Veuillez entrer un nom de salon');
            return;
        }

        // Validation: uniquement alphanumériques, tirets et underscores
        if (!/^[a-zA-Z0-9_-]+$/.test(roomName)) {
            alert('Le nom du salon doit contenir uniquement des lettres, chiffres, tirets et underscores');
            return;
        }

        try {
            const response = await fetch(`${this.serverUrl}/api/rooms/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: roomName,
                    max_players: 20,
                    is_active: true
                })
            });

            if (response.ok) {
                const room = await response.json();
                this.joinRoom(room.name);
            } else {
                alert('Erreur lors de la création du salon');
            }
        } catch (e) {
            console.error('Erreur création salon:', e);
            alert('Impossible de créer le salon');
        }
    }

    /**
     * Rejoint un salon existant
     */
    joinRoom(roomName) {
        this.currentRoom = roomName;
        this.hide();
        this.onRoomSelected(roomName);
    }

    /**
     * Met à jour la liste des salons affichés
     */
    updateRoomsList() {
        const roomsList = this.el.querySelector('.rooms-list');

        if (this.availableRooms.length === 0) {
            roomsList.innerHTML = '<p class="no-rooms">Aucun salon disponible. Créez-en un !</p>';
            return;
        }

        roomsList.innerHTML = this.availableRooms.map(room => `
            <div class="room-item" data-room="${room.name}">
                <div class="room-info">
                    <h3 class="room-name">${this.escapeHtml(room.name)}</h3>
                    <p class="room-players">${room.players ? room.players.length : 0} / ${room.max_players} joueurs</p>
                </div>
                <button class="join-btn" data-room="${room.name}">Rejoindre</button>
            </div>
        `).join('');

        // Ajouter les événements sur les boutons
        roomsList.querySelectorAll('.join-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const roomName = e.target.getAttribute('data-room');
                this.joinRoom(roomName);
            });
        });
    }

    /**
     * Échappe le HTML pour éviter les injections XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Affiche le sélecteur
     */
    show() {
        this.el.style.display = 'flex';
        this.fetchRooms(); // Rafraîchir la liste
    }

    /**
     * Cache le sélecteur
     */
    hide() {
        this.el.style.display = 'none';
    }

    /**
     * Rendu de l'interface
     */
    render() {
        this.el = document.createElement('div');
        this.el.className = 'room-selector';
        this.el.innerHTML = `
            <div class="room-selector-modal">
                <div class="room-selector-header">
                    <h1>🎮 NETWORK PAC-MAN</h1>
                    <p>Choisissez ou créez un salon pour jouer avec d'autres joueurs</p>
                </div>

                <div class="room-selector-content">
                    <div class="create-room-section">
                        <h2>Créer un nouveau salon</h2>
                        <div class="create-room-form">
                            <input
                                type="text"
                                id="room-name-input"
                                placeholder="Nom du salon (ex: ma-partie)"
                                maxlength="50"
                            />
                            <button id="create-room-btn" class="btn-primary">Créer</button>
                        </div>
                    </div>

                    <div class="join-room-section">
                        <h2>Rejoindre un salon existant</h2>
                        <button id="refresh-rooms-btn" class="btn-secondary">🔄 Actualiser</button>
                        <div class="rooms-list">
                            <p class="loading">Chargement des salons...</p>
                        </div>
                    </div>

                    <div class="quick-join-section">
                        <h2>Connexion rapide</h2>
                        <div class="quick-join-form">
                            <input
                                type="text"
                                id="quick-join-input"
                                placeholder="Code du salon"
                                maxlength="50"
                            />
                            <button id="quick-join-btn" class="btn-secondary">Rejoindre</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Styles intégrés
        const style = document.createElement('style');
        style.textContent = `
            .room-selector {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.95);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                font-family: Arial, sans-serif;
            }

            .room-selector-modal {
                background: #1a1a1a;
                border: 3px solid #4CAF50;
                border-radius: 10px;
                padding: 30px;
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                color: #fff;
            }

            .room-selector-header {
                text-align: center;
                margin-bottom: 30px;
            }

            .room-selector-header h1 {
                color: #4CAF50;
                margin: 0 0 10px 0;
                font-size: 32px;
            }

            .room-selector-header p {
                color: #aaa;
                margin: 0;
            }

            .room-selector-content h2 {
                color: #4CAF50;
                font-size: 18px;
                margin: 20px 0 15px 0;
                border-bottom: 2px solid #333;
                padding-bottom: 10px;
            }

            .create-room-form,
            .quick-join-form {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
            }

            .create-room-form input,
            .quick-join-form input {
                flex: 1;
                padding: 12px;
                border: 2px solid #333;
                background: #2a2a2a;
                color: #fff;
                border-radius: 5px;
                font-size: 16px;
            }

            .create-room-form input:focus,
            .quick-join-form input:focus {
                outline: none;
                border-color: #4CAF50;
            }

            .btn-primary,
            .btn-secondary {
                padding: 12px 24px;
                border: none;
                border-radius: 5px;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.3s;
                font-weight: bold;
            }

            .btn-primary {
                background: #4CAF50;
                color: #fff;
            }

            .btn-primary:hover {
                background: #45a049;
                transform: scale(1.05);
            }

            .btn-secondary {
                background: #333;
                color: #fff;
            }

            .btn-secondary:hover {
                background: #444;
            }

            #refresh-rooms-btn {
                margin-bottom: 15px;
                width: 100%;
            }

            .rooms-list {
                max-height: 300px;
                overflow-y: auto;
            }

            .room-item {
                background: #2a2a2a;
                border: 2px solid #333;
                border-radius: 5px;
                padding: 15px;
                margin-bottom: 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: all 0.3s;
            }

            .room-item:hover {
                border-color: #4CAF50;
                transform: translateX(5px);
            }

            .room-info h3 {
                margin: 0 0 5px 0;
                color: #4CAF50;
                font-size: 18px;
            }

            .room-info p {
                margin: 0;
                color: #aaa;
                font-size: 14px;
            }

            .join-btn {
                padding: 10px 20px;
                background: #4CAF50;
                color: #fff;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-weight: bold;
                transition: all 0.3s;
            }

            .join-btn:hover {
                background: #45a049;
                transform: scale(1.1);
            }

            .loading,
            .no-rooms {
                text-align: center;
                color: #888;
                padding: 20px;
                font-style: italic;
            }
        `;
        document.head.appendChild(style);

        // Ajouter au DOM
        document.body.appendChild(this.el);

        // Événements
        this.el.querySelector('#create-room-btn').addEventListener('click', () => {
            const input = this.el.querySelector('#room-name-input');
            this.createRoom(input.value.trim());
            input.value = '';
        });

        this.el.querySelector('#room-name-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createRoom(e.target.value.trim());
                e.target.value = '';
            }
        });

        this.el.querySelector('#refresh-rooms-btn').addEventListener('click', () => {
            this.fetchRooms();
        });

        this.el.querySelector('#quick-join-btn').addEventListener('click', () => {
            const input = this.el.querySelector('#quick-join-input');
            if (input.value.trim()) {
                this.joinRoom(input.value.trim());
                input.value = '';
            }
        });

        this.el.querySelector('#quick-join-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.target.value.trim()) {
                this.joinRoom(e.target.value.trim());
                e.target.value = '';
            }
        });
    }
}

export default RoomSelector;
