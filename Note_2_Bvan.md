Task: Complete i18n for frontend error messages and UI text

We made validation errors translatable (validate.ts now returns i18n keys, en.ts has the English keys). What’s left:

1. Add translations to fr.ts, nl.ts, ar.ts, he.ts for these new keys:

All keys starting with validate. in en.ts (about 20 keys). Search grep "validate\." frontend-react/src/i18n/messages/en.ts to see them all.

2. Replace remaining hardcoded English setError("...") strings with t() calls across these files:

Profile.tsx:134 — "Avatar must be JPEG, PNG, GIF, or WebP"
Profile.tsx:138 — "Avatar must be under 5MB"
Profile.tsx:519 — "Failed to export data."
Profile.tsx:522,546,593,609,631 — "Network error." (use existing key "common.error.network")
DeleteAccount.tsx:18 — "Invalid link."
DeleteAccount.tsx:41 — "Network error." (use existing key "common.error.network")
AdminDashboard.tsx:145 — "Tournament name is required"
AdminDashboard.tsx:150 — "Tournament name must be under 50 characters"
GooseLobby.tsx:67 — "Failed to create game"
GooseLobby.tsx:69,99 — "Network error" (use existing key "common.error.network")
GooseLobby.tsx:82 — "Failed to join"
GooseLobby.tsx:93 — "Failed to delete room"
ChessGame.tsx:214 — "Invalid board position received"

For each, create a new i18n key in en.ts, add t() wrapper, and translate in all 5 language files.

3. Hardcoded UI labels (not just errors) — the evaluator requires “all user-facing text must be translatable”:

Run grep -rn '"[A-Z]' frontend-react/src/pages/ --include="*.tsx" | grep -v "import\|//\|className\|console\|key=\|type=" to find remaining hardcoded English text in JSX. Key pages to check: GooseLobby.tsx, GooseGame.tsx, PacmanLobby.tsx, PacmanGame.tsx, ChessLobby.tsx, AdminDashboard.tsx.

Rule: The project requires 3+ complete language translations with RTL support. All 5 language files (en.ts, fr.ts, nl.ts, ar.ts, he.ts) need the new validation keys translated. fr.ts, nl.ts, ar.ts, he.ts are typed as Partial<Record<MessageKey, string>> so missing keys fall back to English without breaking — but the evaluator may check completeness.

