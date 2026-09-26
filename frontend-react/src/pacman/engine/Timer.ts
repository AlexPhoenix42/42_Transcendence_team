/**
 * Returns the current timestamp in milliseconds.
 * @returns Current timestamp in milliseconds.
 */
export const ts = (): number => new Date().getTime();

/**
 * Timer class for tracking elapsed time with pause/resume functionality.
 * @class Timer
 */
class Timer {
    time: number;
    start: number;
    pauseTime?: number;

    /**
     * Creates an instance of Timer.
     * @param time - The time duration in seconds to track.
     */
    constructor(time: number) {
        this.time = time;
        this.start = ts();
    }

    /**
     * Pauses the timer by recording the current timestamp.
     */
    pause(): void {
        this.pauseTime = ts();
    }

    /**
     * Resumes the timer by adjusting the start time to account for the pause duration.
     */
    resume(): void {
        this.start += ts() - (this.pauseTime ?? ts());
    }

    /**
     * Gets the elapsed time since the timer started (excluding paused time).
     * @returns Elapsed time in milliseconds.
     */
    getElapsed(): number {
        return ts() - this.start;
    }

    /**
     * Checks if the specified time has elapsed.
     * @param time - The time duration in seconds to check against. Defaults to the timer's initial time.
     * @returns True if the elapsed time exceeds the specified time, false otherwise.
     */
    isElapsed(time: number = this.time): boolean {
        return this.getElapsed() > time * 1000;
    }
}

export default Timer;
