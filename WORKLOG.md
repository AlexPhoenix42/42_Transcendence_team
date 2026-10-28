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
