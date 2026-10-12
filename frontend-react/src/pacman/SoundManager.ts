import Sound from "./engine/Sound.ts";

export interface SoundManagerOptions {
    soundEnabled?: boolean;
    addSound: (sound: Sound) => void;
}

/**
 * SoundManager class that manages all game sounds.
 * @class SoundManager
 */
class SoundManager {
    soundEnabled: boolean;
    sounds?: Record<string, Sound>;

    /**
     * Creates an instance of SoundManager.
     * @param options - Configuration options.
     */
    constructor(options: SoundManagerOptions) {
        this.soundEnabled = !!options.soundEnabled;

        if (this.soundEnabled) {
            this.sounds = {
                intro: new Sound("audio/intro.mp3"),
                back: new Sound("audio/back.mp3"),
                dot: new Sound("audio/dot.mp3"),
                eaten: new Sound("audio/eaten.mp3"),
                eat: new Sound("audio/eat.mp3"),
                frightened: new Sound("audio/frightened.mp3"),
                dead: new Sound("audio/dead.mp3"),
                bonus: new Sound("audio/bonus.mp3"),
                life: new Sound("audio/life.mp3"),
            };

            Object.keys(this.sounds).forEach((key) => {
                options.addSound(this.sounds![key]);
            });
        }
    }

    /**
     * Plays a sound by label.
     * @param label - The sound label to play.
     */
    play(label: string): void {
        if (this.soundEnabled) this.sounds![label].play();
    }
}

export default SoundManager;
