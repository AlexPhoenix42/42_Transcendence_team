// frontend-react/src/i18n/messages/he.ts
//
// Hebrew (he-IL). RIGHT-TO-LEFT.
//
// Like ar.ts, these lines are written right-to-left and your editor may show
// them in a surprising order — that is the bidi algorithm rendering them
// correctly, not the file being corrupt. The bytes are in logical order.
//
// Starting point only. Someone who reads Hebrew should review the wording and
// the resulting layout before this ships.

import type { MessageTable } from "./en.ts"

export const he: MessageTable = {
    // ── Navbar ──────────────────────────────────────────────────────────
    "nav.games":        "משחקים",
    "nav.tournaments":  "טורנירים",
    "nav.leaderboard":  "טבלת מובילים",
    "nav.friends":      "חברים",
    "nav.chat":         "צ'אט",
    "nav.profile":      "פרופיל",
    "nav.admin":        "ניהול",
    "nav.editProfile":  "עריכת פרופיל",
    "nav.logout":       "התנתקות",

    // ── Language switcher ───────────────────────────────────────────────
    "lang.label":       "שפה",

    // ── Interpolation demo ──────────────────────────────────────────────
    "nav.greeting":     "שלום, {name}",
}
