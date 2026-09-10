// Chemins d'assets du moteur jsPacman servis en absolu (public/pacman-assets/),
// pour marcher quelle que soit la route React courante.
export const PACMAN_ASSET_BASE = '/pacman-assets/';
export const assetURL = (u) =>
    (!u || /^(https?:|blob:|data:|\/)/.test(u)) ? u : PACMAN_ASSET_BASE + u;
