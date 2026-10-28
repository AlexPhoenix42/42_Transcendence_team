# WORKLOG — i18n cleanup (execute check_i18n.py triage)

Date: 2026-10-28
Task: make `python3 scripts_dev/check_i18n.py` exit 0 by executing the approved triage (I18N_TRIAGE.md).

## Approved plan (condensed)

Decisions:
- Q1 exempt markers: JSX `{/* i18n-exempt: <reason> */}` / TS `// i18n-exempt: <reason>` on the line ABOVE the flagged line.
  Legal pages (PrivacyPolicy.tsx, TermsOfService.tsx): one file-level `// i18n-exempt-file: legal text — requires legal review to translate`.
  Reason is mandatory; the checker rejects a bare marker.
- Q2 checker skips lines whose trimmed text starts with `//` or `{/*`, and multi-line `{/* … */}` blocks.
  No changes to Chat.tsx, Achievements.tsx or other comment-only-hit files.
- Q3 skip `chess_game/internal_views.py` in the backend scan (with the specified inline comment).
- Q4 replace the regex backend extractor with `ast` (dict literals, keys error/detail/message, str Constant values; reject JoinedStr).
  Show the full list of newly-revealed messages and WAIT. "Save this key — it won't be shown again" is exempt.
- Q5 call sites `data.error || t("…")` → `ts(data.error, "…")` for mapped messages; grouped diffs first, WAIT.
- French pacman message: alias in serverErrors.ts → srv.onlyCreatorDeleteRoom, comment "// alias: pacman_game sends French; see TODO 3.24";
  add TODO.md §3.24 (backend fix deferred).

Translation rules: keys only in en/nl/fr/ar/he (never tlh); natural phrasing; ask if unsure; English mirrors en.ts style.

Phases:
1. check_i18n.py improvements (Q1–Q4) → CHECKPOINT 1 (full output + newly revealed messages), wait
2. exempt markers (legal file-level; Games:33, ModuleScorecard:73, Profile:512, Status:178/187) → CHECKPOINT 2, wait
3. srv.* keys (list first, wait) + serverErrors.ts mappings + French alias → CHECKPOINT 3 (check + tsc stays 22), wait
4. call-site ts() fixes (diffs first, wait) → CHECKPOINT 4 (tsc 22, manual UI check by user)
5. propose 2 commits (do not run)

Hard constraints: no commits/pushes (propose `git add <files>` + `git commit -m` only), no edits to legal page content,
Chat.tsx, Achievements.tsx, tlh.ts; no unrelated tsc fixes; no reformatting; no i18n provider/normaliser refactor;
no Makefile changes; no pacman backend fix; no /ponytail or /graphify.

Note: working tree already contains unrelated uncommitted changes (.env*, vault scripts, deleted vault/ & vault-init/,
untracked dotfiles). Not touched by this task; never staged by proposed commands.

### Starting chunk 1 — Phase 1: check_i18n.py improvements (Q1–Q4) — 2026-10-28

Chunk 1 — proposed, NOT yet applied (CLAUDE.md: diff before apply).
- Proposed checker: /tmp/claude-1000/check_i18n.py (diff vs scripts_dev/check_i18n.py shown to user)
- Baseline tsc (npx tsc --noEmit): 22 errors
- Dry run of proposed checker: keys OK (888); backend 18/123 unmapped; literals 22 (was 29 — 7 comment-only hits now skipped)
- Newly revealed by ast: "Invalid action. Use 'accept' or 'decline'." (friends/views.py:281 — old regex truncated it,
  existing serverErrors entry "invalid action. use" is dead), "Save this key — it won't be shown again." (exempt per Q4)
- No longer found: strings in open_auth/views0.py (file is fully commented out) + the two truncated fragments
- Surprise: backend/django/config/vault.py unreadable in the agent sandbox (path rule *vault*) — not a repo problem
- Open questions: unreadable-file handling; "Invalid action" alias; marker in backend file api_key_views.py
STATUS: answered by user (Q1 report unreadable as problem; Q2 replace dead "invalid action. use" entry in Phase 3; Q3 EXEMPT_MESSAGES dict; pacman backend fixed by user before Phase 3 — no French alias)

Finished chunk 1 — applied. Check run: keys 888 (nl/fr/ar/he ✓, tlh 235/888 partial); backend 17/122 unmapped; literals 22; exit 1 (expected at this phase).
Files touched:
scripts_dev/check_i18n.py
WORKLOG.md
Verification:
- check_i18n.py: 3 problems = config/vault.py unreadable (SANDBOX ARTIFACT, user's **/*vault* deny rule — not a repo problem), 17 unmapped, 22 literals
- marker self-test: 2 valid markers accepted, 4 bare/meaningless rejected and reported, file-level marker accepted
- tsc: unchanged (checker is Python; baseline 22)
Proposed commit (chunk 1):
  git add scripts_dev/check_i18n.py WORKLOG.md
  git commit -m "chore(i18n): improve check_i18n.py parser and exclusions" -m "Parse backend messages with ast instead of a regex. The regex cut strings at apostrophes (\"Invalid action. Use 'accept'...\" was read as \"Invalid action. Use\") and matched text in comments. Skip comment lines and multi-line {/* */} blocks in the literal scan. Add i18n-exempt / i18n-exempt-file markers with a mandatory reason, EXEMPT_MESSAGES for backend messages the UI never shows, and skip chess_game/internal_views.py. Report unreadable backend files instead of skipping them silently."

## Phase 1 report
- [HIGH] Plan error: ts(x, fallback) is not "identical in English" — frontend-react/src/i18n/I18nProvider.tsx (ts) — with a fallback, ts() REPLACES any unmapped server text by the fallback, so `data.error || t(k)` → `ts(data.error, k)` hides specific server messages in every locale; `ts(data.error) || t(k)` keeps current behaviour.
- [MEDIUM] Literal scan is narrow — scripts_dev/check_i18n.py (section 3) — regex only catches `>Word words<`, placeholder= and setError("…"); misses text on its own line, apostrophes/punctuation, title=/aria-label=, setSuccess(…) and all .ts files, so "✓ no literals" is weaker than it reads.
- [MEDIUM] Backend scan only sees dict literals — scripts_dev/check_i18n.py (section 2) — messages built in variables, f-strings, DRF exceptions (NotFound("…"), ValidationError) and serializer errors are invisible, so "all mapped" ≠ all user-facing messages covered.
- [MEDIUM] Judgment call: unreadable/unparseable .py now fails the check — scripts_dev/check_i18n.py — a WIP file with a SyntaxError, or a CI Python older than the backend's syntax, will fail check-i18n; previously such files were silently skipped.
- [LOW] Judgment call: removed the Python `# i18n-exempt` marker I had drafted — scripts_dev/check_i18n.py — backend exemptions go only through EXEMPT_MESSAGES per your Q3; markers apply to .tsx only.
- [LOW] Judgment call: "meaningful reason" = ≥3 chars and not exempt/ok/todo — scripts_dev/check_i18n.py (_valid) — reasons like "n/a" or "xxx" still pass; a stricter rule would need a word list or minimum word count.
- [LOW] EXEMPT_MESSAGES matches exact text minus trailing period — scripts_dev/check_i18n.py — a wording change in api_key_views.py:30 makes the message reappear as unmapped (fails safe, but noisy).
- [LOW] Kept the old filters (3–120 chars, capitalised first letter) — scripts_dev/check_i18n.py — lowercase-initial or >120-char messages remain invisible to the check.
- [LOW] Unverified claim in the Q3 comment — scripts_dev/check_i18n.py — the comment says internal_views.py is consumed by "a Django management command", but backend/timeout_checker/ looks like a separate service; worth confirming the wording.
- [LOW] Dead serverErrors.ts entries — frontend-react/src/i18n/serverErrors.ts — strings like "oaauth credentials not configured" now exist only in the fully commented-out open_auth/views0.py, so their mappings are unreachable (harmless).
STATUS: waiting for user
### Chunk 1 committed — 68373c0 — 2026-10-28
(User also committed cbc9a04 fix(pacman): respond in English — pacman_game/views.py:186 now "Only the creator can delete this room."; no French alias needed in Phase 3.)

DECISION for Phase 4 (user): call sites become `ts(data.error) || t("fallback.key")`, NOT `ts(data.error, "fallback.key")` —
ts() with a fallback replaces any unmapped server text, which would hide specific server messages.

### Starting chunk 2 — Phase 2: exempt markers (legal file-level + 5 inline) — 2026-10-28
Finished chunk 2 — applied. Literals 22 -> 0. Checker exit 1 (see below). tsc 22 (unchanged).
Files touched:
frontend-react/src/pages/PrivacyPolicy.tsx
frontend-react/src/pages/TermsOfService.tsx
frontend-react/src/pages/Games.tsx
frontend-react/src/pages/ModuleScorecard.tsx
frontend-react/src/pages/Profile.tsx
frontend-react/src/pages/Status.tsx
WORKLOG.md
Verification:
- git diff --stat: 6 files, 7 insertions, 0 deletions (marker lines only)
- check_i18n.py: keys 888 ✓; literals ✓ none; backend 16/121 unmapped; 2 unparseable files:
  config/vault.py (PermissionError — SANDBOX ARTIFACT) and pacman_game/views.py (SyntaxError — REAL, see below)
- npx tsc --noEmit: 22 errors (unchanged)
Scope note: the i18n-exempt-file marker exempts the ENTIRE file. PrivacyPolicy.tsx and TermsOfService.tsx are pure legal
prose today; a future non-legal line (button, label) added to either will NOT be flagged by check_i18n.py.
BLOCKER found at Checkpoint 2: commit cbc9a04 removed the trailing comma at backend/django/pacman_game/views.py:186
(`{"error": "Only the creator can delete this room."}` followed by `status=...`) → SyntaxError; Django will fail to import
the module. One-character fix (restore the comma) — user's backend commit, not touched by the agent.
Exit 1 is therefore due to: 16 unmapped (Phase 3), vault.py (sandbox artifact), pacman_game/views.py SyntaxError (real).
Unmapped is 16 not 17 only because pacman_game/views.py could not be parsed; its message is identical to goose's, so the
count stays 16 once the comma is restored.
Proposed commit: per plan Phase 5, chunk 2 is folded into the combined "fix(i18n): map remaining backend messages + call
sites" commit (Phases 2-4). If committed alone:
  git add frontend-react/src/pages/PrivacyPolicy.tsx frontend-react/src/pages/TermsOfService.tsx frontend-react/src/pages/Games.tsx frontend-react/src/pages/ModuleScorecard.tsx frontend-react/src/pages/Profile.tsx frontend-react/src/pages/Status.tsx WORKLOG.md
  git commit -m "chore(i18n): mark intentional English with i18n-exempt" -m "Legal pages get a file-level marker (legal review needed to translate); brand, product and format names and the dev-facing scorecard get inline markers. Comment-only lines; no rendered output changes."
STATUS: committed by user (see below)

BLOCKER RESOLVED — user restored the comma; pacman fix now dffffd5 (amended; cbc9a04 no longer in history).
Re-check: backend/django/pacman_game/views.py parses; check_i18n.py reports only config/vault.py unparseable
(sandbox artifact), 16/121 backend messages unmapped, 0 hard-coded literals.
### Chunk 2 committed — as "chore(i18n): mark intentional English with i18n-exempt markers" (stand-alone, not folded
into the Phase 5 combined commit; Phase 5 will propose only the Phases 3+4 commit) — 2026-10-28

### Starting chunk 3 — Phase 3: srv.* keys + serverErrors.ts mappings (table shown, awaiting approval) — 2026-10-28
Approved by user: 15-key table as shown (friendlier English for srv.translateNoLang / srv.tokenUidRequired, matching the
srv.invalidJson precedent). Expected-count correction accepted: 15 new keys (not 16) → 903.
Phase 4 additions (user): AuthContext.login() !resp.ok branch → `error: ts(raw) || t("login.error.failed")`, rawError
unchanged (needsResend uses rawError). Mark TODO.md §3.12 resolved when Phase 4 is applied.

Finished chunk 3 — applied. Unmapped 16 -> 0; keys 888 -> 903 (nl/fr/ar/he), tlh 235; literals 0; tsc 22.
Files touched:
frontend-react/src/i18n/messages/en.ts
frontend-react/src/i18n/messages/nl.ts
frontend-react/src/i18n/messages/fr.ts
frontend-react/src/i18n/messages/ar.ts
frontend-react/src/i18n/messages/he.ts
frontend-react/src/i18n/serverErrors.ts
WORKLOG.md
Verification:
- check_i18n.py: 903 keys ✓ in nl/fr/ar/he; tlh 235/903 partial; all 121 backend messages mapped; no literals;
  exit 1 only from config/vault.py PermissionError (SANDBOX ARTIFACT — passes on the user's machine)
- placeholder mismatches between en and nl/fr/ar/he: 0
- npx tsc --noEmit: 22 errors (unchanged)
- git diff --stat: 5 locale files +17 lines each; serverErrors.ts +16/-1 (15 mappings + invalid-action replacement)
Proposed commit: per plan Phase 5, Phases 3+4 ship as ONE commit ("fix(i18n): map remaining backend messages + call
sites") after Phase 4 — chunk 3 is not committed on its own (mappings without call sites are partly dead).
STATUS: waiting for user

User local run: check_i18n.py exit 0 "✓ i18n is consistent" (903 keys, 121/121 mapped, 0 literals); tsc 22. vault.py sandbox artifact confirmed.

### Starting chunk 4 — Phase 4: call-site ts() fixes + TODO §3.12 (diffs shown, awaiting approval) — 2026-10-28
Approved by user: diffs 1–5, plus diff 6 (PacmanLobby.tsx:186) and the optional AuthContext comment.
Deviation (agent, reported): PacmanLobby line kept its existing `.toUpperCase()` (lobby shows errors in caps):
  setError((ts(data.error) || t("pacmanLobby.error.cancel")).toUpperCase())

Finished chunk 4 — applied. tsc 22; check_i18n.py 903 keys, 121/121 mapped, 0 literals (exit 1 only vault.py sandbox artifact).
Files touched:
frontend-react/src/context/AuthContext.tsx
frontend-react/src/pages/Profile.tsx
frontend-react/src/pages/DeleteAccount.tsx
frontend-react/src/pages/GooseLobby.tsx
frontend-react/src/pages/PacmanLobby.tsx
TODO.md
WORKLOG.md
Verification:
- git diff --stat (these 6 files): 13 insertions, 17 deletions
- npx tsc --noEmit: 22 errors (unchanged)
- Manual UI test: NOT done by agent (no browser in this session) — user to trigger a mapped error (e.g. lock an
  account with 5 failed logins) and confirm it renders in the current locale.
Call sites enabled: srv.accountLocked (login), srv.importNotObject/invalidJsonFile/importTooLarge/importFailed (Profile
import), srv.confirmEmailFailed (Profile delete request), srv.tokenUidRequired/deleteAccountFailed (DeleteAccount),
srv.onlyCreatorDeleteRoom (GooseLobby, PacmanLobby).
Mapped, not yet displayed (6 — kept on purpose; no UI path shows them today):
- srv.exportFailed, srv.exportFormat — Profile export handler never reads the error body (always gdpr.exportError);
  exportFormat is unreachable (UI only offers json/csv/xml)
- srv.noApiKey — Profile revoke handler ignores non-OK responses
- srv.translateNoText, srv.translateNoLang, srv.translateFailed — Chat translateMessage() ignores failures; the UI always
  sends text + target_lang
FINDING (not fixed, out of scope): 34 other call sites still use the two-argument ts(x, "fallback") form, which hides
unmapped server text: TournamentDetail 7, AdminDashboard 5, ChessLobby 5, Login 3, Chat 2, GooseGame 2, PacmanLobby 2,
Profile 2, Tournaments 2, ChessGame 1, ForgotPassword 1, Friends 1, PacmanGame 1. Candidate TODO entry.
Proposed commit: Phases 3+4 combined — message drafted for user review (not run).
STATUS: waiting for user


### Chunk 4 committed — Phases 3+4 shipped as one commit, 2026-10-28

Message: "fix(i18n): map remaining backend messages and translate
call sites". Files: 5 locale files + serverErrors.ts + AuthContext.tsx
+ Profile.tsx + DeleteAccount.tsx + GooseLobby.tsx + PacmanLobby.tsx
+ TODO.md (§3.12 marked DONE) + WORKLOG.md.

Phase 3+4 shipped together (not Phase 3 alone) because mappings without
call sites would be partly dead. 6 mappings (srv.exportFailed,
srv.exportFormat, srv.noApiKey, srv.translateNoText, srv.translateNoLang,
srv.translateFailed) are "mapped, not yet displayed" — kept on purpose,
documented in the commit body.

### Follow-up commit — SimpleJWT login error (separate, 2026-10-28)

Commit: "fix(auth): project-owned login error message + i18n mapping".

Problem: SimpleJWT raises "No active account found with the given
credentials" for any failed login. Dependency message, invisible to
check_i18n.py's AST scanner (logged as TODO §3.27). Users in every
language saw this English technical message.

Fix:
- backend/django/local_auth/two_factor_serializer.py:
  TwoFactorTokenObtainPairSerializer.default_error_messages
  'no_active_account' -> "Invalid username or password."
- frontend-react/src/i18n/serverErrors.ts: mapping
  "invalid username or password" -> srv.invalidCredentials
- frontend-react/src/i18n/messages/{en,nl,fr,ar,he}.ts:
  srv.invalidCredentials key (tlh.ts unchanged)
- TODO.md: §3.27 added

Verified: curl -k -X POST https://localhost:4443/api/login/ with bad
creds returns {"detail":"Invalid username or password."}.
check_i18n.py exit 0. tsc 22.

### Current state — i18n cleanup complete

All work from this session shipped:
- check_i18n.py: exit 0 on user's machine (vault.py sandbox artifact
  only affects the agent's sandbox)
- 903 keys in en/nl/fr/ar/he, tlh 235/903 partial by design
- 121/121 backend messages mapped
- 0 hard-coded literals
- tsc: 22 pre-existing errors, unchanged

No open i18n tasks. Remaining deferred work tracked in TODO.md:
- §3.25: 34 call sites still use ts(x, "fallback") — latent, safe
- §3.27: checker can't see third-party messages — manual fix only
- §3.19: 22 pre-existing tsc errors
- Part 2: backend canonicalization (shelved, deferred)

If a fresh session picks this up: there is nothing left to do for
the i18n cleanup. Do not re-run any phase. The worklog is closed.

