// frontend-react/src/i18n/messages/ar.ts
//
// Arabic (ar, Latin digits). RIGHT-TO-LEFT.
//
// The strings below are written right-to-left. Your editor may render the
// line in a surprising order because of the Unicode bidi algorithm — that is
// the editor displaying it correctly, not the file being corrupted. The bytes
// are in logical order, which is what matters.
//
// These are a starting point. Before this ships, someone who reads Arabic
// should review both the wording and the resulting layout.

import type { MessageTable } from "./en.ts"

export const ar: MessageTable = {
    // ── Navbar ──────────────────────────────────────────────────────────
    "nav.games":        "الألعاب",
    "nav.tournaments":  "البطولات",
    "nav.leaderboard":  "لوحة المتصدرين",
    "nav.friends":      "الأصدقاء",
    "nav.chat":         "الدردشة",
    "nav.profile":      "الملف الشخصي",
    "nav.admin":        "الإدارة",
    "nav.editProfile":  "تعديل الملف الشخصي",
    "nav.logout":       "تسجيل الخروج",

    // ── Language switcher ───────────────────────────────────────────────
    "lang.label":       "اللغة",

    // ── Interpolation demo ──────────────────────────────────────────────
    // {name} holds a username of unknown direction. Phase 3 wraps values
    // like this in <bdi> so a Latin name cannot reorder the Arabic around it.
    "nav.greeting":     "مرحبًا، {name}",
}
