// frontend-react/src/i18n/messages/en.ts
//
// English is the CANONICAL key set. Every key in the app must exist here.
// nl.ts and ar.ts are typed against this file, so:
//   · a key you invent in nl.ts that is not here  -> compile error
//   · a key you have not translated yet           -> allowed, falls back to en
//
// Key convention: flat, dotted, area.thing
//   nav.games   login.submit   chess.action.resign
// Flat rather than nested because it greps cleanly, diffs one line per string
// in review, and three people extracting three pages never collide.

export const en = {
    // ── Navbar ──────────────────────────────────────────────────────────
    "nav.games":        "Games",
    "nav.tournaments":  "Tournaments",
    "nav.leaderboard":  "Leaderboard",
    "nav.friends":      "Friends",
    "nav.chat":         "Chat",
    "nav.profile":      "Profile",
    "nav.admin":        "Admin",
    "nav.editProfile":  "Edit Profile",
    "nav.logout":       "Logout",

    // ── Language switcher ───────────────────────────────────────────────
    "lang.label":       "Language",

    // ── A demo of interpolation, used to prove the pipeline works ───────
    // {name} is replaced at render time: t("nav.greeting", { name: "bram" })
    "nav.greeting":     "Hello, {name}",
} as const

// Every valid key in the app. Deriving this from the object rather than
// maintaining a separate union means the two can never drift apart.
export type MessageKey = keyof typeof en

// The shape nl.ts and ar.ts must conform to: any subset of the English keys.
export type MessageTable = Partial<Record<MessageKey, string>>
