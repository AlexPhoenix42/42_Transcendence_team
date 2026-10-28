# check_i18n.py — triage (Step 1)

Date: 2026-10-27 · Command: `python3 scripts_dev/check_i18n.py` → exit 1, 2 problems
Locale coverage passes: 888 keys in nl/fr/ar/he; `tlh` partial by design (235/888).

No code has been changed yet. Step 2 waits for confirmation of the questions at the bottom.

## A. 29 hard-coded-literal hits

None are category **(a)**: every hit is a false positive or intentionally-English text, so no `t()` changes are needed.

| # | file:line | What it is | Cat. | Proposed action |
|---|---|---|---|---|
| 1 | `components/Achievements.tsx:50` | `//<h2>Chess Achievements</h2>`, commented-out code | d | Checker ignores comment lines (Q2) |
| 2–7 | `pages/Chat.tsx:154, 187, 241, 244, 282, 312` | `//setError("…")`, commented-out code (line 154 has a teammate note: "why did you delete this?") | d | Same; Chat.tsx not touched |
| 8 | `pages/Games.tsx:33` | "Pacman", brand name (kept on purpose) | c | Exempt marker: `brand name` |
| 9 | `pages/ModuleScorecard.tsx:73` | "Total Points", dev-facing scorecard (agreed to stay English) | c | Exempt marker: `internal` |
| 10–21 | `pages/PrivacyPolicy.tsx:7, 31, 56–62, 75–77` (12) | Legal text | b | `legal text` (Q1) |
| 22–26 | `pages/TermsOfService.tsx:7, 19–22` (5) | Legal text | b | `legal text` (Q1) |
| 27 | `pages/Profile.tsx:512` | `JSON` option label, file-format name | c | Exempt marker: `format name` |
| 28–29 | `pages/Status.tsx:178, 187` | "Grafana", "Mailpit", product names | c | Exempt marker: `product name` |

## B. 19 unmapped backend messages

| Message | Source | Verdict | Proposed action |
|---|---|---|---|
| Account temporarily locked. Try again later. | `local_auth/views.py:63` | Real, shown on login | Map → `srv.accountLocked` |
| Expected a JSON object. | `users/gdpr.py:366` | Real | Map |
| Failed to delete account. | `gdpr.py:338` | Real | Map |
| Failed to export data. | `gdpr.py:273` | Real | Map |
| Failed to send confirmation email. | `gdpr.py:311` | Real | Map |
| File too large (max 10MB). | `gdpr.py:357` | Real | Map |
| Import failed. | `gdpr.py:429` | Real | Map |
| Invalid JSON file. | `gdpr.py:362` | Real | Map |
| Token and uid required. | `gdpr.py:322` | Real | Map |
| Supported formats: json, csv, xml | `gdpr.py:249` | Real; practically unreachable (UI only offers those three) | Map (cheap) |
| No API key found. | `users/api_key_views.py:41` | Real | Map |
| No text provided. | `chat/views.py:503` | Real (translate endpoint) | Map |
| No target_lang provided. | `chat/views.py:505` | Real | Map |
| Translation failed. | `chat/views.py:515` | Real | Map |
| Only the creator can delete this room. | `goose_game/views.py:161` | Real | Map → `srv.onlyCreatorDeleteRoom` |
| Seul le créateur peut supprimer le salon. | `pacman_game/views.py:186` | Real, but the backend sends **French** to everyone | Map to the same `srv.onlyCreatorDeleteRoom` |
| Forbidden | `chess_game/internal_views.py:23` | Internal service-to-service endpoint (`/api/internal/game-finished/`), never user-facing | c — skip `internal_views.py` in the checker (Q3) |
| Game not found | `chess_game/internal_views.py:34` | Same | c (Q3) |
| Save this key — it won | `users/api_key_views.py:30` | Checker bug: regex stops at the apostrophe in "won't". Real string is a success `message` the frontend never displays (Profile shows its own `apiKey.saveWarning`) | d (Q4) |

Total: 16 real mappings (15 new `srv.*` keys — two messages share one), 3 checker/internal issues.

## Open questions (must be answered before Step 2)

**Q1 — Exempt marker syntax in JSX.** A `// i18n-exempt: …` comment inside JSX markup renders as visible text.
- (a) Recommended: in JSX use `{/* i18n-exempt: legal text */}` on the line above; in plain TS lines use `// i18n-exempt: …`. The checker exempts a line if it or the line above contains `i18n-exempt:`.
- (b) For PrivacyPolicy/ToS: one file-level marker at the top (`// i18n-exempt-file: legal text`) instead of 17 per-line markers.
- Recommendation: (a) for scattered hits, (b) for the two legal pages.

**Q2 — Commented-out code (7 hits).** Teach the checker to skip lines whose trimmed text starts with `//` or `{/*`. No change to Chat.tsx.

**Q3 — Internal endpoint.** Exclude `internal_views.py` in the checker (recommended), or map "Forbidden" / "Game not found" anyway?

**Q4 — Apostrophe bug.** Fix the backend regex so double-quoted strings may contain `'`. Risk: may reveal new unmapped messages with apostrophes (to be shown before mapping). The "Save this key…" success message: exempt (recommended) or map?

**Q5 — Mapping only helps where the UI calls `ts()`.** Several of these messages are shown via `data.error || t(...)` (Profile GDPR import/delete handlers, AdminDashboard audit unlock), so they stay English until those lines become `ts(data.error) || t(...)` — a small logic change. Include those (diff first), or mappings only?
