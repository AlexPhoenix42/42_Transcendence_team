// frontend-react/src/utils/debug.ts

// ==========================================================================
// Debug logging — silent by default, no console output in production.
//
// To enable in browser:
//   Option 1: add ?debug to the URL  →  https://mi-r1-p4:4443/chess?debug
//   Option 2: run in browser console →  localStorage.setItem('debug', 'true')
//
// To disable:
//   localStorage.removeItem('debug')
//
// Usage in code:
//   import { debug } from '../utils/debug'
//   debug("my message", someVariable)
//
const isDebug = () => {
    try {
        return localStorage.getItem('debug') === 'true'
            || new URLSearchParams(window.location.search).has('debug')
    } catch {
        return false
    }
}

export const debug = (...args: unknown[]) => {
    if (isDebug()) console.log(...args)
}
// ==========================================================================

