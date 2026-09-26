import Dialog from "./Dialog.ts";
import { STATUS_PAUSED } from "./GameModel.ts";
import type GameModel from "./GameModel.ts";
import type Scaling from "./engine/Scaling.ts";

export interface MainMenuDialogOptions {
    model: GameModel;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    factor?: number;
    scaling?: Scaling;
    onResume?: () => void;
    originalWidth?: number;
    originalHeight?: number;
}

/**
 * MainMenuDialog class that extends Dialog with event delegation.
 * @class MainMenuDialog
 * @extends {Dialog}
 */
class MainMenuDialog extends Dialog {
    model: GameModel;
    _onResume?: () => void;

    /**
     * Creates an instance of MainMenuDialog.
     * @param options - Configuration options.
     */
    constructor(options: MainMenuDialogOptions) {
        const {
            model,
            x,
            y,
            factor = 1,
            scaling,
            onResume,
            originalWidth,
            originalHeight,
            width = 697,
            height = 920,
        } = options;

        if (!model) {
            throw new Error("MainMenuDialog requires a model");
        }

        // Center dialog if position not provided
        const dialogX = typeof x !== "undefined" ? x : (originalWidth! - width) / 2;
        const dialogY = typeof y !== "undefined" ? y : (originalHeight! - height) / 2;

        // Initialize Dialog with empty content (will be set in render)
        super({
            width,
            height,
            x: dialogX,
            y: dialogY,
            factor,
            scaling,
            dotColor: "white",
            content: "",
        });

        // Store references after super()
        this.model = model;
        this._onResume = onResume;

        // Listen to model status changes to update menu
        this.model.on("change:status", this._onModelStatusChange.bind(this));
    }

    /**
     * Returns the event delegation map for the dialog.
     * @returns The event delegation map.
     */
    events(): Record<string, string> {
        const base = super.events;
        return {
            ...(typeof base === "function" ? (base as () => Record<string, string>).call(this) : (base as any)),
            "change #sound-checkbox": "_onSoundCheckboxChange",
            "change #overlay-checkbox": "_onOverlayCheckboxChange",
            "click #resume-button": "onResumeButtonClick",
        };
    }

    /**
     * Handles resume button click event.
     */
    onResumeButtonClick(): void {
        if (this._onResume) {
            this._onResume();
        }
    }

    /**
     * Renders the content of the dialog.
     * @returns Returns this instance for method chaining.
     */
    renderContent(): this {
        const isPause = this.model.status === STATUS_PAUSED;
        const title = isPause ? "PAUSED" : "MAIN MENU";
        const exitButtonText = isPause ? "RESUME" : "EXIT MENU";

        const content = `
            <div class="main-menu">
                <h2 class="menu-title">*** ${title} ***</h2>

                <div class="menu-section">
                    <h3 class="menu-section-title">CONTROLS</h3>

                    <div class="control-info">
                        <div class="control-item">
                            <strong>KEYBOARD:</strong>
                            <div class="control-details">
                                <span>←↑↓→</span> Move
                                <br>
                                <span>ESC</span> Pause/Menu
                            </div>
                        </div>

                        <div class="control-item">
                            <strong>GAMEPAD:</strong>
                            <div class="control-details">
                                <span>D-Pad/Stick</span> Move
                                <br>
                                <span>START</span> Pause/Menu/Start
                            </div>
                        </div>

                        <div class="control-item">
                            <strong>TOUCH:</strong>
                            <div class="control-details">
                                <span>Swipe</span> Move
                                <br>
                                <span>Double Tap</span> Pause/Menu
                            </div>
                        </div>
                    </div>
                </div>

                <div class="menu-section">
                    <h3 class="menu-section-title">OPTIONS</h3>

                    <div class="option-item">
                        <label class="checkbox-label">
                            <input type="checkbox" class="menu-checkbox" id="sound-checkbox" ${this.model.soundEnabled ? "checked" : ""}>
                            <span>Sound ON/OFF</span>
                        </label>
                    </div>

                    <div class="option-item">
                        <label class="checkbox-label">
                            <input type="checkbox" class="menu-checkbox" id="overlay-checkbox" ${this.model.overlayEnabled ? "checked" : ""}>
                            <span>Screen FX ON/OFF</span>
                        </label>
                    </div>
                </div>

                <div class="menu-section">
                    <button class="menu-button" id="resume-button">${exitButtonText}</button>
                </div>
            </div>
        `;

        this.$contentArea.innerHTML = content;

        return this;
    }

    /**
     * Handles model status changes to update menu dynamically.
     * @private
     */
    _onModelStatusChange(): void {
        // Re-render with updated content based on new status
        this.render();
    }

    _onSoundCheckboxChange(event: Event): void {
        this.model.soundEnabled = (event.target as HTMLInputElement).checked;
    }

    _onOverlayCheckboxChange(event: Event): void {
        this.model.overlayEnabled = (event.target as HTMLInputElement).checked;
    }

    /**
     * Cleans up event handlers when dialog is destroyed.
     */
    onDestroy(): void {
        if (this.model && this._onModelStatusChange) {
            this.model.off("change:status", this._onModelStatusChange);
        }
    }
}

export default MainMenuDialog;
