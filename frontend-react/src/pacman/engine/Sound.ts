import { assetURL } from "../assetBase.ts";

// Single AudioContext for all sounds.
let audioCtx: AudioContext;
let gainNode: GainNode;

/**
 * Polyfill for decodeAudioData with Promise-based syntax (for Safari compatibility).
 * @param arrayBuffer - The audio data to decode.
 * @returns Promise that resolves with the decoded AudioBuffer.
 */
const decodeAudioData = (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> =>
    new Promise((resolve, reject) => {
        audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
    });

/**
 * Sound class for loading and playing audio files using Web Audio API.
 * @class Sound
 */
class Sound {
    url: string;
    audioBuffer?: AudioBuffer;
    muted?: boolean;

    /**
     * Creates an instance of Sound.
     * @param url - URL of the audio file to load.
     */
    constructor(url: string) {
        if (!audioCtx) {
            const AudioContextCtor =
                window.AudioContext || (window as any).webkitAudioContext;
            audioCtx = new AudioContextCtor();
            gainNode = audioCtx.createGain();
            gainNode.connect(audioCtx.destination);
        }

        this.url = url;
    }

    /**
     * Loads the audio file from the URL and decodes it into an AudioBuffer.
     * @returns Promise that resolves with the AudioBuffer when the audio is loaded and decoded.
     */
    load(): Promise<AudioBuffer> {
        return fetch(assetURL(this.url) as string)
            .then((response) => response.arrayBuffer())
            .then((arrayBuffer) => decodeAudioData(arrayBuffer))
            .then((audioBuffer) => {
                this.audioBuffer = audioBuffer;
                return audioBuffer;
            });
    }

    /**
     * Plays the loaded audio sound.
     * Resumes the AudioContext if it's suspended.
     */
    play(): void {
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }

        const trackSource = audioCtx.createBufferSource();
        trackSource.buffer = this.audioBuffer ?? null;
        trackSource.connect(gainNode);
        trackSource.start();
    }

    /**
     * Mutes or unmutes all sounds by adjusting the gain node.
     * @param muted - If true, mutes sound; if false, unmutes. Defaults to true.
     */
    mute(muted?: boolean): void {
        // Muted my default unless muted === false.
        this.muted = muted !== false;

        if (this.muted) {
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        } else {
            gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
        }
    }

    /**
     * Checks if the audio buffer has been loaded and is ready to play.
     * @returns True if the audio buffer exists, false otherwise.
     */
    isReady(): boolean {
        return !!this.audioBuffer;
    }
}

export default Sound;
