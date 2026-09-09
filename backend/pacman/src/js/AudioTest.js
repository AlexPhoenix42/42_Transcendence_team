/**
 * Audio Test Module
 * Tests and manages audio playback for Pac-Man game
 * Ensures all players can hear game sounds properly
 */

class AudioTest {
    /**
     * Creates an instance of AudioTest.
     */
    constructor() {
        this.audioFiles = {
            'back': 'audio/back.mp3',
            'bonus': 'audio/bonus.mp3',
            'dead': 'audio/dead.mp3',
            'dot': 'audio/dot.mp3',
            'eaten': 'audio/eaten.mp3',
            'eat': 'audio/eat.mp3',
            'frightened': 'audio/frightened.mp3',
            'intro': 'audio/intro.mp3',
            'life': 'audio/life.mp3'
        };

        this.audioElements = new Map();
        this.testResults = new Map();
        this.soundEnabled = true;
        this.volume = 1.0;

        this._initializeAudio();
    }

    /**
     * Initialize audio elements for all sounds.
     * @private
     */
    _initializeAudio() {
        Object.entries(this.audioFiles).forEach(([name, path]) => {
            const audio = new Audio();
            audio.src = path;
            audio.volume = this.volume;
            audio.preload = 'auto';
            this.audioElements.set(name, audio);
        });
    }

    /**
     * Play a specific sound.
     * @param {string} soundName - Name of the sound to play
     * @returns {Promise<boolean>} Promise that resolves to true if sound played successfully
     */
    async playSound(soundName) {
        if (!this.soundEnabled) return false;

        const audio = this.audioElements.get(soundName);
        if (!audio) {
            console.warn(`Sound '${soundName}' not found`);
            return false;
        }

        try {
            audio.currentTime = 0; // Reset to start
            const playPromise = audio.play();

            if (playPromise !== undefined) {
                await playPromise;
                return true;
            }
            return true;
        } catch (error) {
            console.error(`Failed to play sound '${soundName}':`, error);
            return false;
        }
    }

    /**
     * Stop a specific sound.
     * @param {string} soundName - Name of the sound to stop
     */
    stopSound(soundName) {
        const audio = this.audioElements.get(soundName);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    /**
     * Stop all sounds.
     */
    stopAllSounds() {
        this.audioElements.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
    }

    /**
     * Test all audio files for playback capability.
     * @returns {Promise<Object>} Test results for each sound
     */
    async testAllSounds() {
        const results = {};

        for (const [name, audio] of this.audioElements.entries()) {
            results[name] = await this._testSound(name, audio);
        }

        this.testResults = new Map(Object.entries(results));
        return results;
    }

    /**
     * Test a single audio file.
     * @private
     * @param {string} name - Sound name
     * @param {HTMLAudioElement} audio - Audio element
     * @returns {Promise<Object>} Test result
     */
    async _testSound(name, audio) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({
                    name,
                    canPlay: audio.canPlayType('audio/mpeg') !== '',
                    loaded: false,
                    duration: 0,
                    status: 'timeout'
                });
            }, 3000);

            audio.oncanplay = () => {
                clearTimeout(timeout);
                resolve({
                    name,
                    canPlay: true,
                    loaded: true,
                    duration: audio.duration,
                    status: 'ok'
                });
            };

            audio.onerror = () => {
                clearTimeout(timeout);
                resolve({
                    name,
                    canPlay: false,
                    loaded: false,
                    duration: 0,
                    status: 'error',
                    error: audio.error?.message || 'Unknown error'
                });
            };

            audio.load();
        });
    }

    /**
     * Set volume for all sounds.
     * @param {number} level - Volume level (0-1)
     */
    setVolume(level) {
        this.volume = Math.max(0, Math.min(1, level));
        this.audioElements.forEach(audio => {
            audio.volume = this.volume;
        });
    }

    /**
     * Toggle sound on/off.
     * @param {boolean} enabled - Enable or disable sound
     */
    setEnabled(enabled) {
        this.soundEnabled = enabled;
        if (!enabled) {
            this.stopAllSounds();
        }
    }

    /**
     * Get a summary of all test results.
     * @returns {Object} Summary of audio test results
     */
    getTestSummary() {
        const results = Object.fromEntries(this.testResults);
        const passed = Object.values(results).filter(r => r.status === 'ok').length;
        const failed = Object.values(results).filter(r => r.status !== 'ok').length;

        return {
            total: Object.keys(results).length,
            passed,
            failed,
            audioSupported: this._isAudioSupported(),
            results
        };
    }

    /**
     * Check if audio is supported in the browser.
     * @private
     * @returns {boolean} True if audio is supported
     */
    _isAudioSupported() {
        const audio = new Audio();
        return audio.canPlayType('audio/mpeg') !== '';
    }

    /**
     * Get detailed audio diagnostics.
     * @returns {Object} Audio diagnostics
     */
    getDiagnostics() {
        return {
            audioSupported: this._isAudioSupported(),
            soundEnabled: this.soundEnabled,
            volume: this.volume,
            audioCount: this.audioElements.size,
            loadedSounds: Array.from(this.audioElements.entries())
                .filter(([, audio]) => audio.readyState === 4)
                .map(([name]) => name),
            failedSounds: Array.from(this.audioElements.entries())
                .filter(([, audio]) => audio.error !== null)
                .map(([name]) => name),
            testResults: this.testResults.size > 0 ? this.getTestSummary() : 'No tests run yet'
        };
    }
}

export default AudioTest;
