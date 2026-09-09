/**
 * Communication Manager
 * Handles player microphone input and spectator chat
 * Enables real-time communication between players and spectators
 */

class CommunicationManager {
    /**
     * Creates an instance of CommunicationManager.
     * @param {Object} options - Configuration options
     * @param {string} options.userType - 'player' or 'spectator'
     * @param {string} options.userId - Unique user identifier
     * @param {string} options.userName - Display name
     * @param {Function} options.onMessageReceived - Callback for new messages
     * @param {Function} options.onPlayerAudio - Callback when player audio is received
     */
    constructor(options) {
        this.userType = options.userType || 'spectator'; // 'player' or 'spectator'
        this.userId = options.userId;
        this.userName = options.userName;

        // Callbacks
        this.onMessageReceived = options.onMessageReceived || (() => {});
        this.onPlayerAudio = options.onPlayerAudio || (() => {});
        this.onStatusChange = options.onStatusChange || (() => {});

        // State
        this.isConnected = false;
        this.messages = [];
        this.activePlayers = new Map();
        this.currentAudioStream = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.analyser = null;

        // Settings
        this.audioEnabled = this.userType === 'player';
        this.chatEnabled = this.userType === 'spectator';
        this.soundEnabled = true;

        // Initialize
        this._initialize();
    }

    /**
     * Initialize the communication manager.
     * @private
     */
    _initialize() {
        if (this.userType === 'player') {
            this._initializePlayerAudio();
        } else {
            this._initializeSpectatorChat();
        }
    }

    /**
     * Initialize player audio system.
     * @private
     */
    _initializePlayerAudio() {
        // Check if browser supports getUserMedia
        const getUserMedia = navigator.getUserMedia ||
                           navigator.webkitGetUserMedia ||
                           navigator.mozGetUserMedia ||
                           navigator.msGetUserMedia;

        if (!getUserMedia) {
            console.error('getUserMedia not supported');
            this.onStatusChange({
                type: 'error',
                message: 'Microphone not supported in this browser'
            });
            return;
        }

        this._requestMicrophoneAccess();
    }

    /**
     * Request microphone access.
     * @private
     */
    _requestMicrophoneAccess() {
        navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 16000
            }
        })
        .then(stream => {
            this.currentAudioStream = stream;
            this._setupAudioProcessing(stream);
            this.isConnected = true;
            this.onStatusChange({
                type: 'success',
                message: 'Microphone connected successfully'
            });
        })
        .catch(error => {
            console.error('Microphone access denied:', error);
            this.onStatusChange({
                type: 'error',
                message: `Microphone access denied: ${error.message}`
            });
        });
    }

    /**
     * Setup audio processing and recording.
     * @private
     * @param {MediaStream} stream - Audio stream from microphone
     */
    _setupAudioProcessing(stream) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();

        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.analyser);

        // Setup MediaRecorder
        const options = {
            audioBitsPerSecond: 128000,
            mimeType: 'audio/webm;codecs=opus'
        };

        try {
            this.mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
            // Fallback to default options
            this.mediaRecorder = new MediaRecorder(stream);
        }

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this._sendAudioChunk(event.data);
            }
        };

        this.mediaRecorder.onerror = (error) => {
            console.error('MediaRecorder error:', error);
        };

        // Start recording chunks every 100ms
        this.mediaRecorder.start(100);
    }

    /**
     * Send audio chunk to spectators.
     * @private
     * @param {Blob} audioBlob - Audio data blob
     */
    _sendAudioChunk(audioBlob) {
        const reader = new FileReader();
        reader.onload = () => {
            // In a real app, send via WebSocket to spectators
            this.onPlayerAudio({
                userId: this.userId,
                userName: this.userName,
                audioData: reader.result,
                timestamp: Date.now()
            });
        };
        reader.readAsArrayBuffer(audioBlob);
    }

    /**
     * Initialize spectator chat system.
     * @private
     */
    _initializeSpectatorChat() {
        this.isConnected = true;
        this.onStatusChange({
            type: 'info',
            message: 'Chat mode enabled - You can see and write messages'
        });
    }

    /**
     * Send a chat message (spectators only).
     * @param {string} message - Message text
     * @returns {Object} Sent message object
     */
    sendMessage(message) {
        if (this.userType !== 'spectator') {
            return { success: false, error: 'Only spectators can send messages' };
        }

        if (!message || message.trim().length === 0) {
            return { success: false, error: 'Message cannot be empty' };
        }

        const msg = {
            id: `${this.userId}_${Date.now()}`,
            userId: this.userId,
            userName: this.userName,
            userType: 'spectator',
            message: message.trim(),
            timestamp: Date.now(),
            avatar: '👁️'
        };

        this.messages.push(msg);

        // In a real app, send via WebSocket
        return { success: true, message: msg };
    }

    /**
     * Receive a message (from WebSocket in real app).
     * @param {Object} message - Message object
     */
    receiveMessage(message) {
        this.messages.push(message);
        this.onMessageReceived(message);
    }

    /**
     * Get volume level from microphone (0-100).
     * @returns {number} Current volume level
     */
    getMicrophoneLevel() {
        if (!this.analyser) return 0;

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }

        return Math.round((sum / dataArray.length) * 100 / 255);
    }

    /**
     * Mute/unmute microphone.
     * @param {boolean} muted - True to mute, false to unmute
     */
    setMuted(muted) {
        if (this.currentAudioStream) {
            this.currentAudioStream.getTracks().forEach(track => {
                track.enabled = !muted;
            });

            this.onStatusChange({
                type: 'info',
                message: muted ? 'Microphone muted' : 'Microphone unmuted'
            });
        }
    }

    /**
     * Stop microphone and close stream.
     */
    stopMicrophone() {
        if (this.currentAudioStream) {
            this.currentAudioStream.getTracks().forEach(track => track.stop());
            this.currentAudioStream = null;
        }

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        if (this.audioContext) {
            this.audioContext.close();
        }

        this.isConnected = false;
        this.onStatusChange({
            type: 'info',
            message: 'Microphone disconnected'
        });
    }

    /**
     * Play audio from another player.
     * @param {ArrayBuffer} audioData - Audio data to play
     */
    playPlayerAudio(audioData) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        this.audioContext.decodeAudioData(audioData, (buffer) => {
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);
        });
    }

    /**
     * Get all messages.
     * @returns {Array} Array of message objects
     */
    getMessages() {
        return this.messages;
    }

    /**
     * Get recent messages.
     * @param {number} count - Number of recent messages to return
     * @returns {Array} Array of message objects
     */
    getRecentMessages(count = 10) {
        return this.messages.slice(-count);
    }

    /**
     * Clear all messages.
     */
    clearMessages() {
        this.messages = [];
    }

    /**
     * Register an active player.
     * @param {string} playerId - Player ID
     * @param {string} playerName - Player name
     */
    registerPlayer(playerId, playerName) {
        this.activePlayers.set(playerId, {
            id: playerId,
            name: playerName,
            isActive: true,
            audioLevel: 0
        });
    }

    /**
     * Update player audio level.
     * @param {string} playerId - Player ID
     * @param {number} level - Audio level (0-100)
     */
    updatePlayerAudioLevel(playerId, level) {
        if (this.activePlayers.has(playerId)) {
            const player = this.activePlayers.get(playerId);
            player.audioLevel = level;
        }
    }

    /**
     * Get active players.
     * @returns {Array} Array of player objects
     */
    getActivePlayers() {
        return Array.from(this.activePlayers.values());
    }

    /**
     * Get connection status.
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            userType: this.userType,
            userId: this.userId,
            userName: this.userName,
            audioEnabled: this.audioEnabled,
            chatEnabled: this.chatEnabled,
            soundEnabled: this.soundEnabled,
            messageCount: this.messages.length,
            activePlayers: this.activePlayers.size,
            microphoneLevel: this.userType === 'player' ? this.getMicrophoneLevel() : null
        };
    }

    /**
     * Get debug information.
     * @returns {Object} Debug info
     */
    getDebugInfo() {
        return {
            status: this.getStatus(),
            recentMessages: this.getRecentMessages(5),
            activePlayers: this.getActivePlayers(),
            audioContextState: this.audioContext?.state || 'closed',
            mediaRecorderState: this.mediaRecorder?.state || 'inactive'
        };
    }
}

export default CommunicationManager;
