import View from "rasti/View.js";

/**
 * Event name for swipe gestures.
 */
export const EVENT_SWIPE = "swipe";

/**
 * Event name for double-tap gestures.
 */
export const EVENT_DOUBLE_TAP = "doubletap";

/**
 * Event name for upward swipe gestures.
 */
export const EVENT_SWIPE_UP = "swipe:up";
/**
 * Event name for rightward swipe gestures.
 */
export const EVENT_SWIPE_RIGHT = "swipe:right";
/**
 * Event name for downward swipe gestures.
 */
export const EVENT_SWIPE_DOWN = "swipe:down";
/**
 * Event name for leftward swipe gestures.
 */
export const EVENT_SWIPE_LEFT = "swipe:left";

export interface TouchOptions {
    el?: HTMLElement;
    threshold?: number;
    restraint?: number;
    allowedTime?: number;
    doubleTapDelay?: number;
    doubleTapThreshold?: number;
}

/**
 * Default properties for Touch instances.
 */
const defaults: Required<Omit<TouchOptions, "el">> = {
    threshold: 100, // required min distance traveled to be considered swipe
    restraint: 150, // maximum distance allowed at the same time in perpendicular direction
    allowedTime: 400, // maximum time allowed to travel that distance
    doubleTapDelay: 300, // maximum time between taps to be considered double-tap (milliseconds)
    doubleTapThreshold: 50, // maximum distance between taps to be considered double-tap (pixels)
};

/**
 * Touch event handler class for detecting swipe gestures on touch devices.
 * Extends View from rasti framework.
 * @class Touch
 * @extends {View}
 */
class Touch extends View {
    // No initializers (see engine/Sprite.ts for why).
    threshold!: number;
    restraint!: number;
    allowedTime!: number;
    doubleTapDelay!: number;
    doubleTapThreshold!: number;

    startX = 0;
    startY = 0;
    startTime = 0;
    private _lastTapTime = 0;
    private _lastTapX = 0;
    private _lastTapY = 0;

    /**
     * Creates an instance of Touch.
     * @param options - Configuration options.
     */
    constructor(options: TouchOptions = {}) {
        super({
            ...options,
            el: options.el || (document && document.body),
        });

        // Only touches a key `if (key in options)` - see engine/Sprite.ts for
        // why that (not an unconditional assign) is what makes the fields
        // above's missing initializers actually take effect.
        (Object.keys(defaults) as (keyof typeof defaults)[]).forEach((key) => {
            if (key in options) (this as any)[key] = (options as any)[key];
        });

        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);

        this.el.addEventListener("touchstart", this.onTouchStart, false);
        this.el.addEventListener("touchend", this.onTouchEnd, false);
    }

    /**
     * Cleanup method called when the Touch instance is destroyed.
     * Removes touch event listeners.
     */
    onDestroy(): void {
        this.el.removeEventListener("touchstart", this.onTouchStart);
        this.el.removeEventListener("touchend", this.onTouchEnd);
    }

    /**
     * Handles touch start events to record the initial touch position and time.
     * Also detects double-tap gestures.
     * @param event - The touch event.
     */
    onTouchStart(event: TouchEvent): void {
        const touch = event.changedTouches[0];

        this.startX = touch.pageX;
        this.startY = touch.pageY;
        this.startTime = Date.now(); // record time when finger first makes contact with surface

        // Double-tap detection
        const currentTime = Date.now();
        const timeDiff = currentTime - this._lastTapTime;
        const x = touch.pageX;
        const y = touch.pageY;
        const xDiff = Math.abs(x - this._lastTapX);
        const yDiff = Math.abs(y - this._lastTapY);

        // Check if this is a double-tap (within time and distance thresholds)
        if (
            timeDiff < this.doubleTapDelay &&
            xDiff < this.doubleTapThreshold &&
            yDiff < this.doubleTapThreshold
        ) {
            // Double-tap detected
            this.emit(EVENT_DOUBLE_TAP, event);
            // Reset to prevent triple-tap
            this._lastTapTime = 0;
        } else {
            // Store tap info for potential double-tap
            this._lastTapTime = currentTime;
            this._lastTapX = x;
            this._lastTapY = y;
        }
    }

    /**
     * Handles touch end events to detect swipe gestures and emit appropriate events.
     * @param event - The touch event.
     */
    onTouchEnd(event: TouchEvent): void {
        let type: string | null = null;

        const touch = event.changedTouches[0];

        const distX = touch.pageX - this.startX; // get horizontal dist traveled by finger while in contact with surface
        const distY = touch.pageY - this.startY; // get vertical dist traveled by finger while in contact with surface
        const elapsedTime = Date.now() - this.startTime; // get time elapsed

        if (elapsedTime <= this.allowedTime) {
            // first condition for awipe met
            if (Math.abs(distX) >= this.threshold && Math.abs(distY) <= this.restraint) {
                // 2nd condition for horizontal swipe met
                type = distX < 0 ? EVENT_SWIPE_LEFT : EVENT_SWIPE_RIGHT; // if dist traveled is negative, it indicates left swipe
            } else if (Math.abs(distY) >= this.threshold && Math.abs(distX) <= this.restraint) {
                // 2nd condition for vertical swipe met
                type = distY < 0 ? EVENT_SWIPE_UP : EVENT_SWIPE_DOWN; // if dist traveled is negative, it indicates up swipe
            }

            this.emit(EVENT_SWIPE, type, event);
        }
    }
}

Object.assign(Touch.prototype, defaults);

export default Touch;
