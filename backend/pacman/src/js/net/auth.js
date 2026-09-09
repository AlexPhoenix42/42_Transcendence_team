/**
 * auth - who is the current player.
 *
 * The account + 42 OAuth is handled by a **separate backend** (teammate's
 * service). This module only:
 *  - sends the browser to `<AUTH_BASE>/api/auth/42/login/` to start the flow;
 *  - reads the logged-in user from `<AUTH_BASE>/api/auth/me/` (cookie session);
 *  - falls back to a stable dev "guest" name when nobody is logged in.
 *
 * `AUTH_BASE` defaults to same-origin. Override for a cross-host backend with
 * `?authBase=http://host:port` once (persisted) or `localStorage['pacman.authBase']`.
 *
 * @module auth
 */

const GUEST_KEY = 'pacman.guest';
const BASE_KEY = 'pacman.authBase';

function readLS(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function writeLS(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
}

/** Base URL of the auth backend (no trailing slash). '' = same origin. */
export const AUTH_BASE = (() => {
    try {
        const q = new URLSearchParams(window.location.search).get('authBase');
        if (q) writeLS(BASE_KEY, q.replace(/\/$/, ''));
    } catch (e) { /* ignore */ }
    return (readLS(BASE_KEY) || '').replace(/\/$/, '');
})();

/** In-memory cache of the current account (null = anonymous, undefined = unknown). */
let _me;

/** URL that starts the 42 OAuth flow (teammate's backend redirects to the intra). */
export function ft42LoginUrl() {
    return `${AUTH_BASE}/api/auth/42/login/`;
}

/**
 * Ask the backend who we are (cookie session). Call once on page load before
 * `getCurrentUser()` / `isLoggedIn()`. Safe to call repeatedly.
 * @returns {Promise<Object|null>} the account, or null if anonymous.
 */
export async function initAuth() {
    try {
        const res = await fetch(`${AUTH_BASE}/api/auth/me/`, {
            credentials : 'include',
            headers : { Accept : 'application/json' },
        });
        _me = res.ok ? await res.json() : null;
    } catch (e) {
        _me = null;
    }
    return _me;
}

/** @returns {boolean} true if a 42 account is logged in. */
export function isLoggedIn() {
    return !!(_me && (_me.username || _me.login));
}

/**
 * @returns {{name: string, username: string|null, guest: boolean}} current player.
 */
export function getCurrentUser() {
    if (_me && (_me.username || _me.login)) {
        const username = _me.username || _me.login;
        return {
            name : _me.display_name || _me.displayname || username,
            username,
            guest : false,
        };
    }
    let guest = readLS(GUEST_KEY);
    if (!guest) {
        guest = `Invité-${Math.random().toString(36).slice(2, 6)}`;
        writeLS(GUEST_KEY, guest);
    }
    return { name : guest, username : null, guest : true };
}

/** Log out of the account (best effort), then reload state. */
export async function logout() {
    try {
        await fetch(`${AUTH_BASE}/api/auth/logout/`, {
            method : 'POST', credentials : 'include',
        });
    } catch (e) { /* ignore */ }
    _me = null;
}
