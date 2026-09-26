/**
 * Scaling utility class for maintaining aspect ratio when resizing.
 * @class Scaling
 */
class Scaling {
    originalWidth: number;
    originalHeight: number;
    width: number;
    height: number;
    widthToHeight: number;

    /**
     * Creates an instance of Scaling.
     * @param w - Original width.
     * @param h - Original height.
     */
    constructor(w: number, h: number) {
        this.originalWidth = this.width = w;
        this.originalHeight = this.height = h;

        this.widthToHeight = w / h;
    }

    /**
     * Resizes the dimensions while maintaining the original aspect ratio.
     * @param newWidth - New width to fit.
     * @param newHeight - New height to fit.
     */
    resize(newWidth: number, newHeight: number): void {
        const newWidthToHeight = newWidth / newHeight;

        if (newWidthToHeight > this.widthToHeight) {
            this.width = newHeight * this.widthToHeight;
            this.height = newHeight;
        } else {
            this.height = newWidth / this.widthToHeight;
            this.width = newWidth;
        }
    }

    /**
     * Gets the scaling factor (ratio of current width to original width).
     * @returns The scaling factor.
     */
    getFactor(): number {
        return this.width / this.originalWidth;
    }
}

export default Scaling;
