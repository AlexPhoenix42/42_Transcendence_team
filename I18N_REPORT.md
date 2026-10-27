# i18n sweep — report

Date: 2026-10-27 · Branch: `fix-after-fail` · Scope: `frontend-react/` only (backend not touched)

## How translation works in this project

- `src/i18n/I18nProvider.tsx` — custom provider. Helpers from `useI18n()` / `useT()`:
  `t` (translate + `{placeholders}`), `tn` (plural-aware, uses `Intl.PluralRules`), `n` (numbers),
  `d` (dates), `ts` (maps English server messages to keys via `serverErrors.ts`).
- `src/i18n/messages/en.ts` is the canonical key set; `nl`, `fr`, `ar`, `he`, `tlh` are typed against it.
  Missing key → English fallback → the key itself.
- `src/i18n/config.ts` — locales, RTL (`ar`, `he`), Intl tags. `tlh` (Klingon) is partial by design (`complete: false`).

## Rules followed

- Only hardcoded strings replaced with `t()` / `tn()`. No refactors, no logic changes.
- Icons/emoji (⚔️ 🗑️ 🔇 ✓ 🧙 👍 👎 ©, W/L/D badges) stay in the JSX; translation values contain words only.
- Each file shown as a diff and approved before being applied, one file at a time.

## What was done

### 1. Missing translations filled (nl, fr, ar, he)
29 keys existed in `en.ts` but in no other locale: `chat.translate`, `chat.hideTranslation`,
11 `analytics.*` (export, date filter, charts) and 16 `gdpr.*`.

### 2. Hardcoded strings → `t()` (component + `en` + `nl` + `fr` + `ar` + `he`)

| File | What |
|---|---|
| `pages/Profile.tsx` | 2FA messages, whole API-key section (17 keys) |
| `pages/Games.tsx` | Pacman 3D / Pacman / Whiteboard card text ("Pacman", "Pacman 3D" kept — brand) |
| `pages/Tournaments.tsx` | "Players: x/y", "Time: …", time-control format |
| `pages/TournamentDetail.tsx` | player count, "No participants yet.", typing indicator, time-control format |
| `pages/Friends.tsx` | request sentences |
| `pages/NotFound.tsx` | 404 text (+ `useT` import/hook) |
| `components/Footer.tsx` | links + "All rights reserved." (© and year stay in JSX) |
| `layouts/LegalLayout.tsx` | "Loading..." (existing key) |
| `pages/Status.tsx` | summary line, "critical", "Last …", "API Docs" |
| `pages/ChessGame.tsx` | "Game #", "Back", "CHECK!", "AI …", typing indicator |
| `pages/ChessLobby.tsx` | time-control options (both forms), "vs", "(AI …)" |
| `pages/Chat.tsx` | invite texts, "(expired)", Delete, Mute, Seen, typing, invite banners |
| `pages/Analytics.tsx` | "vs Humans/AI", game counts (plural), moves (plural) |
| `pages/PublicProfile.tsx` | friends count (plural) |
| `components/WizardQuiz.tsx` | was hardcoded **French** for every language; `fr.ts` keeps the original sentences |
| `context/AuthContext.tsx` | "Login failed", "Network error…" fallbacks (existing keys) |
| `pages/AdminDashboard.tsx` | Security Audit tab (filters, table, pagination, messages), time-control options, "(disabled)" |

New plural sets follow the existing `common.players_*` pattern: `analytics.games_*`, `publicProfile.friends_*`, `audit.events_*`.
Arabic uses all six CLDR forms; Hebrew mixed-gender verbs use the `/ה` form.

### Verification
- Key parity: en / nl / fr / ar / he — 886 keys each, none missing, none extra, no duplicates.
- Placeholders: 0 mismatches between `en` and the other locales.
- Type-check: no new errors vs. the baseline taken before any change.
- oxlint: 54 findings before, 54 after.
- `graphify update .` run.

## Deliberately not translated

- `PrivacyPolicy.tsx`, `TermsOfService.tsx` (legal text, still has `[Project Name]` placeholders),
  `Docs.tsx`, `ModuleScorecard.tsx`, solo Pacman engine `src/pacman/*` (arcade font has no Arabic/Hebrew glyphs) — agreed.
- Raw server values displayed as-is: tournament/match status, audit `event_type` badge, service status/kind.
  Translating these needs a lookup map (a code change, not a string swap).
- `data.error || …` fallbacks were not wrapped in `ts()` (logic change).
- `tlh.ts` not extended — new keys fall back to English, as designed.

## Bugs found — NOT fixed (decide separately)

1. `pages/ChessGame.tsx` ~L673 — game-over reason is built as `` t(`chess.reason.${reason}`, reason) ``.
   For `REPETITION`, `50_MOVES`, `INSUFFICIENT_MATERIAL`, `CANCELLED` (and `DRAW_*`) the screen shows the raw key,
   e.g. `chess.reason.50_moves`. `MatchHistory.tsx` already has a correct reason → key map that could be reused.
2. `pages/Login.tsx` — the resend-verification prompt checks the error text for the English words "frozen"/"verify".
   The OAuth path passes the error through `ts()`, so in other languages the prompt never appears.
3. `api/client.ts` — the catch block returns `new Response(..., { status: 0 })`, which throws (status must be 200–599),
   so the "Network error" fallback never works.
4. `pages/AdminDashboard.tsx` L79/L83 — `useEffect` called after an early return (oxlint `rules-of-hooks` error).
5. `pages/ChessLobby.tsx` ~L341 — the "vs AI" form's practice checkbox is bound to `pvpPractice`.
6. `tsconfig.json` — `baseUrl` is rejected by the installed TypeScript 7 (`TS5102`), so `tsc -p tsconfig.json` cannot run.
   Checks above used an equivalent config without `baseUrl`.
7. `i18n/config.ts` mentions `scripts_dev/check_i18n.py`, which does not exist.
