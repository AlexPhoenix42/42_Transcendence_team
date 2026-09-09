/**
 * VoiceChatManager - Gestion du chat vocal WebRTC
 * Tous les joueurs du même salon s'entendent
 */
class VoiceChatManager {
    constructor(options = {}) {
        this.networkManager = options.networkManager;
        this.roomName = options.roomName;
        this.serverUrl = options.serverUrl || 'ws://localhost:8000';

        this.localStream = null;
        this.peerConnections = new Map(); // Map<peerId, RTCPeerConnection>
        this.voiceSocket = null;
        this.micEnabled = true;
    }

    /**
     * Initialise le microphone et connecte au serveur vocal
     */
    async initialize() {
        try {
            // Demander accès au microphone
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            console.log('🎤 Microphone activé');

            // Créer le conteneur audio pour les joueurs distants
            this.createAudioContainer();

            // Connecter au serveur vocal WebSocket
            this.connectVoiceServer();

        } catch (error) {
            console.error('❌ Erreur microphone:', error);
            alert('Impossible d\'accéder au microphone. Le chat vocal ne fonctionnera pas.');
        }
    }

    /**
     * Crée le conteneur pour les éléments audio distants
     */
    createAudioContainer() {
        if (!document.getElementById('remote-audio-container')) {
            const container = document.createElement('div');
            container.id = 'remote-audio-container';
            container.style.display = 'none';
            document.body.appendChild(container);
        }
    }

    /**
     * Connecte au serveur vocal WebSocket
     */
    connectVoiceServer() {
        const url = `${this.serverUrl}/ws/voice/${this.roomName}/`;

        this.voiceSocket = new WebSocket(url);

        this.voiceSocket.onopen = () => {
            console.log('🎙️ Connecté au serveur vocal');

            // Annoncer notre présence
            this.sendVoiceSignal({
                type: 'join'
            });
        };

        this.voiceSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleVoiceSignal(data);
            } catch (e) {
                console.error('Erreur parsing signal vocal:', e);
            }
        };

        this.voiceSocket.onerror = (error) => {
            console.error('❌ Erreur WebSocket vocal:', error);
        };

        this.voiceSocket.onclose = () => {
            console.log('🔌 Déconnecté du serveur vocal');
        };
    }

    /**
     * Gère les signaux WebRTC reçus
     */
    async handleVoiceSignal(data) {
        const { sender_id, signal } = data;

        if (!signal) return;

        switch (signal.type) {
            case 'join':
                // Un nouveau joueur rejoint, créer une offre
                await this.createOffer(sender_id);
                break;

            case 'offer':
                // Recevoir une offre, créer une réponse
                await this.handleOffer(sender_id, signal.offer);
                break;

            case 'answer':
                // Recevoir une réponse
                await this.handleAnswer(sender_id, signal.answer);
                break;

            case 'ice-candidate':
                // Recevoir un candidat ICE
                await this.handleIceCandidate(sender_id, signal.candidate);
                break;

            case 'leave':
                // Un joueur part
                this.removePeer(sender_id);
                break;
        }
    }

    /**
     * Crée une connexion peer-to-peer
     */
    async createPeerConnection(peerId) {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        const peerConnection = new RTCPeerConnection(configuration);

        // Ajouter notre stream local
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, this.localStream);
            });
        }

        // Gérer les candidats ICE
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendVoiceSignal({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    target: peerId
                });
            }
        };

        // Gérer les tracks distants
        peerConnection.ontrack = (event) => {
            this.handleRemoteTrack(event, peerId);
        };

        // Gérer la déconnexion
        peerConnection.onconnectionstatechange = () => {
            if (peerConnection.connectionState === 'disconnected' ||
                peerConnection.connectionState === 'failed') {
                this.removePeer(peerId);
            }
        };

        this.peerConnections.set(peerId, peerConnection);

        return peerConnection;
    }

    /**
     * Crée une offre WebRTC
     */
    async createOffer(peerId) {
        try {
            const peerConnection = await this.createPeerConnection(peerId);

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            this.sendVoiceSignal({
                type: 'offer',
                offer: offer,
                target: peerId
            });
        } catch (error) {
            console.error('Erreur création offre:', error);
        }
    }

    /**
     * Gère une offre WebRTC reçue
     */
    async handleOffer(peerId, offer) {
        try {
            const peerConnection = await this.createPeerConnection(peerId);

            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            this.sendVoiceSignal({
                type: 'answer',
                answer: answer,
                target: peerId
            });
        } catch (error) {
            console.error('Erreur gestion offre:', error);
        }
    }

    /**
     * Gère une réponse WebRTC reçue
     */
    async handleAnswer(peerId, answer) {
        try {
            const peerConnection = this.peerConnections.get(peerId);

            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (error) {
            console.error('Erreur gestion réponse:', error);
        }
    }

    /**
     * Gère un candidat ICE reçu
     */
    async handleIceCandidate(peerId, candidate) {
        try {
            const peerConnection = this.peerConnections.get(peerId);

            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Erreur ajout ICE candidate:', error);
        }
    }

    /**
     * Gère un track audio distant
     */
    handleRemoteTrack(event, peerId) {
        console.log('🔊 Audio reçu de:', peerId);

        const container = document.getElementById('remote-audio-container');
        if (!container) return;

        // Supprimer l'ancien élément audio s'il existe
        const oldAudio = document.getElementById(`audio-${peerId}`);
        if (oldAudio) oldAudio.remove();

        // Créer un nouvel élément audio
        const audio = document.createElement('audio');
        audio.id = `audio-${peerId}`;
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
        audio.volume = 1.0;

        container.appendChild(audio);
    }

    /**
     * Envoie un signal vocal
     */
    sendVoiceSignal(signal) {
        if (this.voiceSocket && this.voiceSocket.readyState === WebSocket.OPEN) {
            try {
                this.voiceSocket.send(JSON.stringify(signal));
            } catch (e) {
                console.error('Erreur envoi signal vocal:', e);
            }
        }
    }

    /**
     * Supprime une connexion peer
     */
    removePeer(peerId) {
        const peerConnection = this.peerConnections.get(peerId);

        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(peerId);
        }

        // Supprimer l'élément audio
        const audio = document.getElementById(`audio-${peerId}`);
        if (audio) audio.remove();
    }

    /**
     * Active/désactive le microphone
     */
    toggleMicrophone() {
        this.micEnabled = !this.micEnabled;

        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = this.micEnabled;
            });
        }

        return this.micEnabled;
    }

    /**
     * Nettoyage complet
     */
    destroy() {
        // Fermer toutes les connexions peer
        this.peerConnections.forEach((pc) => pc.close());
        this.peerConnections.clear();

        // Arrêter le stream local
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Fermer le WebSocket
        if (this.voiceSocket) {
            this.voiceSocket.close();
            this.voiceSocket = null;
        }
    }
}

export default VoiceChatManager;
