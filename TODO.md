# Chess game-over reason — TODO

## Part 1 — THE FIX (this patch)

Goal: kill the "raw key shown" bug end-to-end, with **behavior unchanged**.
AI-vs-H draw still advances the AI. No tournament-advancement changes.

---

### 1.1 Canonical reason set (DECIDED)

`DRAW_*` is explicit everywhere. Draws are distinguishable by the reason
string itself, never by `winner == null` alone (because `CANCELLED` is also
`winner == null`, and because `DRAW_*` may co-exist with a non-null winner
in tournament games where someone must advance).

Final set — exactly 9 values, no others:

  Non-draw:
    CHECKMATE
    RESIGNATION
    TIMEOUT
    DISCONNECT
    CANCELLED            (winner = null)

  Draw:
    DRAW_STALEMATE
    DRAW_REPETITION
    DRAW_50_MOVES
    DRAW_INSUFFICIENT

Eliminated:
  STALEMATE            -> DRAW_STALEMATE
  REPETITION           -> DRAW_REPETITION
  50_MOVES             -> DRAW_50_MOVES
  INSUFFICIENT_MATERIAL-> DRAW_INSUFFICIENT
  "DRAW"               -> removed entirely (see 1.2.3)

---

### 1.2 Backend changes

#### 1.2.1 Enum (`backend/django/chess_game/models.py`)

`GameResultReason` currently has only CHECKMATE, RESIGNATION, TIMEOUT,
DISCONNECT, CANCELLED. Add the four draw values:

    DRAW_STALEMATE       = "DRAW_STALEMATE",       "Draw (stalemate)"
    DRAW_REPETITION      = "DRAW_REPETITION",      "Draw (repetition)"
    DRAW_50_MOVES        = "DRAW_50_MOVES",        "Draw (50-move rule)"
    DRAW_INSUFFICIENT    = "DRAW_INSUFFICIENT",    "Draw (insufficient material)"

#### 1.2.2 Migration

`result_reason` is `max_length=15` (migrations/0001_initial.py:23).
Longest canonical value is `DRAW_INSUFFICIENT` (17 chars). Column WILL
raise on Postgres when written. Bump to `max_length=20` (headroom).

=> generate new migration (`makemigrations chess_game`)

#### 1.2.3 `_finish_game_draw` (`backend/django/chess_game/consumers.py:929`)

Currently writes `game.result_reason = "DRAW"` unconditionally.
`"DRAW"` is not in the enum, cannot be rendered on the frontend, and loses
the cause. Change to take a `reason` argument and write the specific
`DRAW_*` value passed in by each caller.

    def _finish_game_draw(self, reason: str) -> None:   # was: ()
        ...
        game.result_reason = reason                     # was: "DRAW"

Callers to update (each already knows which draw it is):
    consumers.py:424   -> _finish_game_draw("DRAW_REPETITION")
    consumers.py:449   -> _finish_game_draw("DRAW_50_MOVES")
    consumers.py:474   -> _finish_game_draw("DRAW_INSUFFICIENT")

Also in `_finish_game_draw`: `update_player_stats(game)` is called TWICE
(consumers.py:945-946 and 948-949). Delete the duplicate. (B3)

#### 1.2.4 Broadcast sites — rename to canonical set

`backend/django/chess_game/consumers.py`:

    413  _finish_game(ai_user_id, "REPETITION")            -> "DRAW_REPETITION"
    416  {"reason": "REPETITION"}                          -> "DRAW_REPETITION"
    427  {"reason": "DRAW_REPETITION"}                      (already correct)
    439  _finish_game(ai_user_id, "50_MOVES")              -> "DRAW_50_MOVES"
    442  {"reason": "50_MOVES"}                            -> "DRAW_50_MOVES"
    452  {"reason": "DRAW_50_MOVES"}                        (already correct)
    464  _finish_game(ai_user_id, "INSUFFICIENT_MATERIAL") -> "DRAW_INSUFFICIENT"
    467  {"reason": "INSUFFICIENT_MATERIAL"}               -> "DRAW_INSUFFICIENT"
    477  {"reason": "DRAW_INSUFFICIENT"}                    (already correct)
    727  {"reason": "STALEMATE"}                           -> "DRAW_STALEMATE"
    778  _finish_game(ai_user_id, "REPETITION")            -> "DRAW_REPETITION"
    778  {"reason": "REPETITION"}                          -> "DRAW_REPETITION"
    790  _finish_game(ai_user_id, "50_MOVES")              -> "DRAW_50_MOVES"
    790  {"reason": "50_MOVES"}                            -> "DRAW_50_MOVES"
    799  _finish_game(ai_user_id, "INSUFFICIENT_MATERIAL") -> "DRAW_INSUFFICIENT"
    802  {"reason": "INSUFFICIENT_MATERIAL"}               -> "DRAW_INSUFFICIENT"

`backend/django/chess_game/ai_autoplay.py`:

    144  {"reason": "STALEMATE"}                           -> "DRAW_STALEMATE"
    177  {"reason": "REPETITION"}                          -> "DRAW_REPETITION"
    189  {"reason": "50_MOVES"}                            -> "DRAW_50_MOVES"
    223  _finish_game_sync(..., "INSUFFICIENT_MATERIAL")   -> "DRAW_INSUFFICIENT"
    224  {"reason": "INSUFFICIENT_MATERIAL"}               -> "DRAW_INSUFFICIENT"

#### 1.2.5 VERIFY BEFORE EDITING: `consumers.py:727`

This broadcast is `{"winner": self.user.pk, "reason": "STALEMATE"}` —
a stalemate being sent with a **non-null winner**. That is unusual (stalemate
is a draw for both players). Need to read the surrounding block
(~lines 700-740) before renaming, to confirm this really is a
"draw but someone advances" tournament case and not a separate bug.

#### 1.2.6 Sweep for any remaining bare names

After edits, the following must return ZERO hits in `chess_game/`:

    rg -n '"STALEMATE"|"REPETITION"|"50_MOVES"|"INSUFFICIENT_MATERIAL"|"DRAW"' \
       backend/django/chess_game -tpy -g '!tests' -g '!*0.py'

(`"DRAW"` may only appear as a substring of `DRAW_*`.)

---

### 1.3 Frontend changes (`frontend-react/src/pages/ChessGame.tsx`)

#### 1.3.1 Replace the string-building at line 673

Current (broken):

    {t(`chess.reason.${gameOverInfo.reason.toLowerCase()}`, gameOverInfo.reason)}

Problems:
  - `.toLowerCase()` crashes on undefined / non-string
  - `"50_MOVES".toLowerCase()` = `"50_moves"` (digit prefix, cannot be a key)
  - `"INSUFFICIENT_MATERIAL".toLowerCase()` != any key
  - no fallback if unknown

Replace with an explicit `Record<string, string>` map covering all 9
canonical values + `UNKNOWN`, plus a safe default. Same pattern already used
correctly in `MatchHistory.tsx:64-74`.

#### 1.3.2 The three `gameOverInfo` writers

Both writers must guarantee `reason` is a non-empty string:

  - REST path  (line 105-108): `game.result_reason || "UNKNOWN"` — OK,
    but confirm `game.winner` handling for draws (see 1.3.3).
  - WS path    (line 324): `data.reason` — add `|| "UNKNOWN"` guard.

#### 1.3.3 Draw / no-winner display (unhappy paths)

Currently:
  - WS draw (`winner = 0`): renders `"0 wins — …"`  (line 312-324)
  - REST draw (`winner` falsy): renders `"Unknown wins — …"`  (line 106)

Fix: when `winner` is falsy (`0`, `null`, `undefined`, `""`, `"0"`), do NOT
render "<X> wins —". Render the draw label from `reason` instead
(e.g. `t("chess.draw")` + reason). Treat `"0"` (string) as falsy-draw too.

#### 1.3.4 Sync path sets `gameOver` with no `gameOverInfo` (line 242-245)

`data.status === "FINISHED"` sets `gameOver = true` but never calls
`setGameOverInfo`. The render block at 669 requires both, so result banner
silently does not render. Either populate `gameOverInfo` there, or make the
render block tolerate a missing `gameOverInfo` and still show a generic
"Game over" banner.

#### 1.3.5 `TIMEOUT` clock branch (line 317) is case-sensitive

If the wire ever sends `"timeout"` (lowercase) the clock reset is skipped.
Low priority — the backend always sends uppercase — but worth a note.

#### 1.3.6 `MatchHistory.tsx` (lines 64-74) — same map, same bugs

The explicit map there is **missing `DISCONNECT` and `CANCELLED`**, and
still contains `DRAW` (which the backend will no longer send after 1.2).
Update to the canonical 9-value set. This file already handles most cases
correctly — just realign to the canonical set.

---

### 1.4 Translation keys — DECISION STILL OPEN

Two candidates for how to key the map:

  (A) Reuse existing `reason.*` keys where they exist
      (`reason.repetition`, `reason.fiftyMoves`, `reason.insufficient`,
       `reason.drawRepetition`, `reason.draw50`, `reason.drawInsufficient`),
      and add only what's missing (`chess.reason.cancelled`, `DRAW_STALEMATE`,
      `UNKNOWN`).  => fewer new translations.

  (B) Unify everything under `chess.reason.*`.  => 6 languages × ~10 strings
      duplicated, but one namespace for chess-game endings.

NOT YET DECIDED. Decide before writing frontend map.

Whichever is chosen, these keys must exist in **all** of
`en.ts, nl.ts, he.ts, fr.ts, ar.ts, tlh.ts`:

    checkmate, resignation, timeout, disconnect, cancelled,
    draw_stalemate, draw_repetition, draw_50_moves, draw_insufficient,
    unknown

(tlh.ts is currently missing almost all of the `reason.*` block — see
lines 91-94.)

---

### 1.5 Verification (must pass before merge)

1. `rg` sweep (1.2.6) returns zero hits.
2. `makemigrations --check` is clean (migration 1.2.2 applied).
3. Backend tests still pass — especially:
     backend/django/chess_game/tests/test_all.py
     backend/django/chess_game/tests/test_ai_consumer.py
     backend/django/chess_game/tests/test_consumers0.py
4. Manual: play one game per ending (checkmate, resignation, timeout,
   repetition, 50-move, insufficient, stalemate, cancel) and confirm the
   frontend shows a human-readable string, never a raw key.
5. Manual: an H-vs-AI tournament draw still advances the AI (behavior
   unchanged).

---

## Part 2 — DEFERRED (DO NOT FIX IN THIS PATCH)

Logged so nothing evaporates. Each is separate, small, and unrelated to
the raw-key bug.

### 2.1 AI→human advancement in H-vs-AI tournament draws

Currently `consumers.py:413/439/464` and `ai_autoplay.py:177/189/224`
make the **AI** advance on a draw. Confirmed working; user wants it kept
for now. If ever switched to "human advances":

  - read `backend/django/chess_game/stats.py` (never read — ELO/win counts
    logic unknown)
  - update all draw-advancement sites (6+ broadcasts + 3 `_finish_game*`
    calls)
  - update tournament chat notifications (`signals.py:47-52` says
    "{winner} defeated {loser}" — wrong message for a drawn tournament game)
  - update `MatchHistory.tsx` / `ChessGame.tsx` rendering

Blast radius not yet established. Do as a standalone behavior change.

### 2.2 H-vs-H tournament draw stalls the bracket

`consumers.py:424/449/474` call `_finish_game_draw()` → `match.winner = None`
→ `bracket.py:130` (`if not match.winner: return`) → bracket never advances.
No tournament-layer code resolves this. Confirm whether this is intended
(H-vs-H draws end the tournament? or should one player advance?) before
touching.

### 2.3 `internal_views.py` — security

`GameFinishedNotify` is `permission_classes = [AllowAny]` and guards only
by `REMOTE_ADDR.startswith("172.")`. Anyone who can reach the host from a
private IP range can force a `game.save(update_fields=[...])`. Also
`logger.error(...)` on every call (should probably be `.debug` or `.info`).

### 2.4 `notify_global_room` used but not imported (`tournament/signals.py`)

`match_post_save` calls `notify_global_room(...)` at line ~73, but the
import block at the top only imports `notify_tournament_room`. This will
raise `NameError` the moment a tournament finishes (i.e. the tournament-
won broadcast never fires).

### 2.5 `_auto_start_ai_matches` called twice

`tournament/signals.py`: `match_post_save` has two consecutive `if`
blocks with identical condition `instance.status == FINISHED and
instance.winner`, both calling `_auto_start_ai_matches(instance.tournament)`.
Duplicate work; remove one.

### 2.6 `check_timeouts0.py` / `test_ai.py` dead code

`management/commands/check_timeouts0.py` is a fully-commented-out older
version. Untouched but confusing during recon. Consider deleting.

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

After Part 1, the wire emits ONLY:
  CHECKMATE, RESIGNATION, TIMEOUT, DISCONNECT, CANCELLED,
  DRAW_STALEMATE, DRAW_REPETITION, DRAW_50_MOVES, DRAW_INSUFFICIENT
  (frontend may also see "UNKNOWN" on missing data)
