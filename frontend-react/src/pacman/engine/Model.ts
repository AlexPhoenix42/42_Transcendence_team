import Model from "rasti/Model.js";

/**
 * Model class that extends rasti Model to use localStorage for persistence.
 * @class ModelLocalStorage
 * @extends {Model}
 */
class ModelLocalStorage extends Model {
    /** Storage key (rasti convention: models with a `url` persist under it). */
    declare url?: string;

    /**
     * Creates an instance of ModelLocalStorage.
     * @param attrs - Attributes to initialize the model with.
     */
    constructor(attrs?: Record<string, unknown>) {
        super(attrs);
    }

    /**
     * Fetches data from localStorage using the model's URL as the key.
     * If data exists, it parses and sets it on the model.
     */
    fetch(): void {
        if (this.url && window.localStorage) {
            const item = window.localStorage.getItem(this.url);
            if (item) this.set(JSON.parse(item));
        }
    }

    /**
     * Saves the model data to localStorage using the model's URL as the key.
     * The model is serialized to JSON before storing.
     */
    save(): void {
        if (this.url && window.localStorage) {
            window.localStorage.setItem(this.url, JSON.stringify(this));
        }
    }
}

export default ModelLocalStorage;
