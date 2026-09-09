import Character from '../Character.js';

/**
 * NetworkPlayer - Représente un autre joueur en réseau
 * Utilise le système de Character existant mais contrôlé par le réseau
 */
class NetworkPlayer extends Character {
    constructor(options) {
        super(options);

        this.playerId = options.playerId;
        this.nickname = options.nickname || 'Player';
        this.playerRole = options.playerRole || 'pacman';
        this.isLocalPlayer = false;

        // Interpolation pour un mouvement fluide
        this.targetX = this.x;
        this.targetY = this.y;
        this.interpolationSpeed = 0.3;
    }

    /**
     * Met à jour la position cible depuis le réseau
     */
    updateFromNetwork(data) {
        this.targetX = data.x;
        this.targetY = data.y;
        if (data.dir) {
            this.dir = data.dir;
            this.setNextAnimation();
        }
    }

    /**
     * Interpole vers la position cible pour un mouvement fluide
     */
    update() {
        // Interpolation linéaire vers la position cible
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;

        if (Math.abs(dx) > 1) {
            this.x += dx * this.interpolationSpeed;
        } else {
            this.x = this.targetX;
        }

        if (Math.abs(dy) > 1) {
            this.y += dy * this.interpolationSpeed;
        } else {
            this.y = this.targetY;
        }

        // Mise à jour visuelle
        if (this._lastX !== this.x || this._lastY !== this.y) {
            this.setXYZ({
                x: this.x,
                y: this.y
            });

            this._lastX = this.x;
            this._lastY = this.y;

            if (!this._moving) {
                this.resumeAnimation();
                this._moving = true;
            }
        } else {
            if (this._moving) {
                this.pauseAnimation();
                this._moving = false;
            }
        }

        // Mise à jour de l'animation
        if (this._nextAnimation && this.animation !== this._nextAnimation) {
            this.setAnimation(this._nextAnimation);
        }
    }
}

export default NetworkPlayer;
