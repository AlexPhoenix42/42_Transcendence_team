# Project TODO

Started as "Chess game-over reason — TODO" but the session grew: fixing
the raw-key bug also surfaced and fixed several unrelated issues (auth
resend-prompt, api client network fallback, admin dashboard hook order,
chess lobby checkbox wiring, typecheck). A follow-on session then
cleaned up the i18n layer end-to-end (checker, exemptions, mappings,
call sites, SimpleJWT). This file tracks everything, both shipped and
deferred.

**Strategic note on why Part 1 diverged from the original plan:** the
original plan (Part 2 below) was to canonicalize the backend reason set
to 9 clean DRAW_* values. That would have required backend changes,
migrations, and behaviour review. Given (a) the deadline, (b) the
project being evaluated on observed behaviour rather than code, and (c)
backend canonicalization touching tournament advancement, we shipped
**frontend-only defensive fixes** that handle every existing wire value
correctly. The frontend map (Part 1.1) is the single source of truth; if
Part 2 is ever done, the map is trivially realigned.

---

## Part 1 — SHIPPED (session log)

In commit order. Each is a real commit.

### 1.1 Game-over banner raw translation keys

[... unchanged from current file, sections 1.1 through 1.9 ...]

### 1.10 i18n cleanup session — checker + exemptions + mappings

Follow-on session executing the `check_i18n.py` triage. Three commits:

**`chore(i18n): improve check_i18n.py parser and exclusions`**

- Parser rewrite: `ast` walker for backend messages instead of regex
  (the regex cut strings at apostrophes — `"Invalid action. Use
  'accept'..."` was read as `"Invalid action. Use"` — so a dead
  mapping existed and the message was never translated).
- Skip comment-only lines (`//`, `{/* */}` including multi-line) in
  the literal scan (7 false positives eliminated).
- `i18n-exempt` / `i18n-exempt-file` markers with mandatory reason
  (rejects empty / "ok" / "exempt").
- `EXEMPT_MESSAGES` dict for backend messages the UI never displays
  ("Save this key — it won't be shown again").
- Skip `chess_game/internal_views.py` (service-to-service, not UI).
- Report unreadable backend files instead of silently skipping.

**`chore(i18n): mark intentional English with i18n-exempt markers`**

- File-level marker for `PrivacyPolicy.tsx` / `TermsOfService.tsx`
  (legal text, requires legal review to translate).
- Inline markers for brand/product/format names (Games: Pacman;
  Status: Grafana, Mailpit; Profile: JSON) and dev-facing internal
  label (ModuleScorecard: Total Points).
- Literal count 22 → 0. Rendered output unchanged.

**`fix(i18n): map remaining backend messages and translate call sites`**

- 15 new `srv.*` keys in en/nl/fr/ar/he (tlh unchanged). Keys:
  `accountLocked, tokenUidRequired, importNotObject, invalidJsonFile,
  importTooLarge, importFailed, exportFailed, exportFormat,
  deleteAccountFailed, confirmEmailFailed, noApiKey,
  translateNoText, translateNoLang, translateFailed,
  onlyCreatorDeleteRoom`. `srv.translateNoLang` and
  `srv.tokenUidRequired` use friendlier English ("No target language
  provided." / "Invalid or incomplete link.") following the
  `srv.invalidJson` precedent.
- Replaced dead `"invalid action. use"` mapping with the full string.
- 6 call sites rewired to `ts(data.error) || t("fallback")` (not
  `ts(data.error, "fallback")` — the two-arg form hides unmapped
  messages). Files: AuthContext.login, Profile.tsx ×2, DeleteAccount,
  GooseLobby, PacmanLobby (kept `.toUpperCase()`).
- 6 mappings kept "mapped, not yet displayed" (no UI path consumes
  them): `exportFailed, exportFormat, noApiKey, translateNoText,
  translateNoLang, translateFailed`.
- Result: 903 keys, 121/121 backend messages mapped, 0 literals,
  exit 0 on user's machine, tsc still 22.

### 1.11 SimpleJWT login error follow-up

**`fix(auth): project-owned login error message + i18n mapping`**

- The password-login error message came from SimpleJWT's
  `default_error_messages` (`"No active account found with the given
  credentials"`), invisible to the AST scanner (see 3.27). Users in
  every language saw English.
- Override on `TwoFactorTokenObtainPairSerializer` in
  `backend/django/local_auth/two_factor_serializer.py`:
  `default_error_messages = {'no_active_account': 'Invalid username
  or password.'}`. Standard login wording; stops leaking whether an
  account exists but is inactive.
- Mapping + 5 locale keys (`srv.invalidCredentials`), 903 → 904 keys.
- curl-verified: `{"detail":"Invalid username or password."}`.

### 1.12 Doc commits

- `docs: add game-over reason TODO` (initial file)
- `docs: fill TODO gap (2.7) and log stale backend test suite (2.8)`
- `docs(worklog): close i18n cleanup session`
- `docs(worklog): record post-commit verification`
- (this update you are reading now)

---

## Part 2 — DEFERRED: Backend canonicalization of game-over reasons

[... unchanged from current file, sections 2.1 through 2.7 ...]

---

## Part 3 — DEFERRED: other issues surfaced during the session

Pre-existing or latent. Each is small and independent. Done ones are
kept in place so the numbering is stable.

### 3.1 — 3.21
[... unchanged from current file ...]

### 3.22 19 backend error messages unmapped in serverErrors.ts — DONE ✅

Fixed in "fix(i18n): map remaining backend messages and translate call
sites". 121/121 backend messages mapped, 15 new srv.* keys in
en/nl/fr/ar/he, 6 call sites rewired to `ts(x) || t("fallback")`.
903 keys in the 5 complete locales. Kept as placeholder for stable
numbering.

### 3.23 29 hard-coded English literals flagged in components — DONE ✅

Fixed in two commits:
- `chore(i18n): improve check_i18n.py parser and exclusions` removed 7
  false positives (commented-out code) by skipping comment lines and
  `{/* */}` blocks.
- `chore(i18n): mark intentional English with i18n-exempt markers`
  added exempt markers to the remaining 22: file-level for
  PrivacyPolicy.tsx / TermsOfService.tsx (legal text), inline for
  brand/product/format names (Games, Profile, Status) and the internal
  ModuleScorecard label.

Literal count 0. Kept as placeholder for stable numbering.

### 3.24 pacman_game sends French error strings — DONE ✅

`pacman_game/views.py:186` returned "Seul le créateur peut supprimer
le salon." — the only Django endpoint that responded in French. Every
other endpoint responds in English and lets the frontend translate via
`ts()`. Changed to English ("Only the creator can delete this room."),
matching `goose_game/views.py:161`. Both map to
`srv.onlyCreatorDeleteRoom` with no French alias needed. Kept as
placeholder for stable numbering.

### 3.25 34 call sites still use `ts(x, "fallback")` — latent

Phase 4 converted 6 call sites to `ts(x) || t("fallback")`. 34 more
still use the two-argument form (TournamentDetail ×7, AdminDashboard
×5, ChessLobby ×5, Login ×3, Chat ×2, GooseGame ×2, PacmanLobby ×2,
Profile ×2, Tournaments ×2, ChessGame ×1, ForgotPassword ×1, Friends
×1, PacmanGame ×1).

Behavioural difference: with the two-arg form, an UNMAPPED backend
message is replaced by the fallback string in every language, instead
of shown verbatim. Currently safe because Phase 3 mapped all 121
backend messages visible to the AST scanner. Becomes real when:
  - A new Django error is added without a serverErrors.ts entry
  - A dependency message is unmapped (see 3.27)

Users then see a generic fallback instead of the specific message.

Fix pattern (mechanical):
    ts(data.error, "key")  →  ts(data.error) || t("key")

Do as a single coherent pass when adding the next backend error, or
when any of these messages surfaces English in a non-English UI.

Pre-existing. Deferred.

### 3.27 check_i18n.py cannot see third-party library messages — partly mitigated

The AST scanner reads only `backend/django/**/*.py` for dicts keyed
`error` / `detail` / `message`. Messages raised by third-party code
are invisible:
  - SimpleJWT's `default_error_messages` dict (keyed `no_active_account`)
  - DRF `AuthenticationFailed` / `NotFound` / `PermissionDenied`
    defaults
  - Django messages framework

Consequence: "121/121 mapped" means "all *visible* messages are
mapped", not "no untranslated message can reach a user".

Partially mitigated in "fix(auth): project-owned login error message
+ i18n mapping":
  - Overrode `TwoFactorTokenObtainPairSerializer.default_error_messages`
    so `no_active_account` now emits "Invalid username or password."
    (the message is now project-owned, but the current scanner still
    misses it — the key is `no_active_account`, not one of the three
    the scanner looks for — so the mapping was added manually)
  - Added `srv.invalidCredentials` to serverErrors.ts + 5 locales
  - curl-verified end-to-end; 903 → 904 keys

Follow-ups to close this category:
  - Extend scanner to walk any dict of string values (not just dicts
    keyed error/detail/message), so `default_error_messages` is
    visible
  - Or add a manual scan section for known DRF/SimpleJWT default
    messages
  - Or frontend telemetry: log every ts() call that returns unmapped
    text and review periodically

Pre-existing. Deferred.

---

## Reference — wire values currently emitted by backend

Proven inventory (all read, none inferred):

  From enum (DB writes only):   CHECKMATE, RESIGNATION, TIMEOUT,
                                DISCONNECT, CANCELLED
  From raw strings (wire + DB): STALEMATE, REPETITION, 50_MOVES,
                                INSUFFICIENT_MATERIAL,
                                DRAW_REPETITION, DRAW_50_MOVES,
                                DRAW_INSUFFICIENT
  DB-only (consumers.py:939):   "DRAW"
  Frontend fallback:            "UNKNOWN"

The frontend REASON_KEY map (Part 1.1) handles all of these plus
UNKNOWN. If Part 2 (backend canonicalization) ever lands, the map
shrinks to the 9 canonical values and the DRAW_STALEMATE etc. keys are
added.

Additional user-facing messages mapped manually (invisible to the
AST scanner — see 3.27):

  From SimpleJWT (dependency):  "No active account found with the
                                given credentials" — overridden to
                                "Invalid username or password." in
                                two_factor_serializer.py, mapped to
                                srv.invalidCredentials

