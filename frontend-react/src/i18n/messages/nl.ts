// frontend-react/src/i18n/messages/nl.ts
//
// Dutch (nl-BE). Typed as MessageTable = Partial<Record<MessageKey, string>>,
// so omissions are legal and fall back to English, but a key that does not
// exist in en.ts is a compile error.

import type { MessageTable } from "./en.ts"

export const nl: MessageTable = {
    // ── Navbar ──────────────────────────────────────────────────────────
    "nav.games":        "Spellen",
    "nav.tournaments":  "Toernooien",
    "nav.leaderboard":  "Ranglijst",
    "nav.friends":      "Vrienden",
    "nav.chat":         "Chat",
    "nav.profile":      "Profiel",
    "nav.admin":        "Beheer",
    "nav.editProfile":  "Profiel bewerken",
    "nav.logout":       "Uitloggen",

    // ── Language switcher ───────────────────────────────────────────────
    "lang.label":       "Taal",

    // ── Interpolation demo ──────────────────────────────────────────────
    "nav.greeting":     "Hallo, {name}",
}
