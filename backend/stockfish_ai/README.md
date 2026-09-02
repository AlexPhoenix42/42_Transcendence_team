
---

this didnt work so we built stockfish from source inside the container.

To download and build stockfish with musl into /bin

docker run --rm -v "$PWD":/out alpine:3.19 sh -c "
    apk add --no-cache git build-base &&
    git clone https://github.com/official-stockfish/Stockfish.git /tmp/sf &&
    cd /tmp/sf/src &&
    make -j\$(nproc) build ARCH=x86-64-avx2 &&
    cp stockfish /out/
"

---

The Stockfish service is running. Now let's review the integration plan to ensure every piece is production‑proof before we code.

---

## AI Integration Plan – Review

### 1. System AI user
- A single `User` record (e.g., `username="stockfish_ai"`, `is_active=False`) acts as the AI opponent.
- It never authenticates – the consumer generates moves for it.
- ✅ No security risk; the user is blocked from login.

### 2. Game model extensions
- `player2_is_ai = BooleanField(default=False)`
- `ai_difficulty = CharField(choices=[easy/medium/hard], null=True, blank=True)`
- ✅ Backward‑compatible; existing games unaffected.

### 3. Game creation API
- Accept optional `ai_opponent` and `ai_difficulty` in `POST /api/games/`.
- When `ai_opponent` is true:
  - `player2` is set to the AI user.
  - `player2_is_ai = True`.
  - Game starts immediately (`IN_PROGRESS`, no waiting).
- **New consideration:** who creates the initial Redis state? `GameListCreateView` currently only sets `player1` and `status=WAITING`. We need to handle the immediate start logic.  
  → This can be done in `GameListCreateView` or a new `GameCreateAIView`. The simplest is to keep `GameListCreateView` as-is and add a dedicated endpoint `POST /api/games/ai/` that creates the game fully initialised, including Redis seed and `active_games` set.  
  This avoids mixing AI logic into the existing join flow.

### 4. Consumer AI turn logic
- In `receive`, after processing a human move and broadcasting the new state, check if `crnt_turn` is the AI user.
- If yes, call the AI engine `POST /bestmove` with the current FEN and difficulty.
- Validate the AI move through `POST /validate` (same as human move).
- Apply the move, update Redis, broadcast state.
- Add a small artificial delay (0.5–1.0 s) so the move doesn't appear instant.
- **Edge case:** if AI engine is down, treat as `ENGINE_UNAVAILABLE` and let the disconnect checker handle it after a grace period, or immediately forfeit the AI?  
  → Best: treat like a human disconnect – the human wins after 30 s. That reuses the existing disconnect checker with no extra code.

### 5. Error handling & time controls
- Timed games: the AI clock ticks while it's "thinking". The consumer sends `movetime` (e.g., 1–3 s) instead of full `wtime/btime` to keep things simple. The AI's thinking time is deducted from its clock when the move response arrives (actual elapsed time).
- If AI exceeds its time, the human wins by timeout (existing checker handles this).
- If AI engine is down: `ENGINE_ERROR` is sent to the human; the game pauses; if AI doesn't move within its time control, the human wins by timeout. No special forfeit needed.

### 6. Tournaments (future)
- Admin can add AI participants as filler.
- `MatchStartView` will detect AI matches and automatically start the game (no human start needed).

---

## Action items (in order)

1. **System AI user** – create via a data migration or a management command.
2. **Model changes** – add `player2_is_ai` and `ai_difficulty` to `Game`.
3. **AI Game creation endpoint** – `POST /api/games/ai/` that creates the game, seeds Redis, and marks it `IN_PROGRESS`.
4. **Consumer AI logic** – after a human move, if the next player is AI, call AI engine, validate, apply, broadcast.
5. **Error handling** – AI engine down → human wins by disconnect (reuse checker).
6. **Time control** – consumer sends `movetime` based on a fraction of the AI's remaining clock (or a fixed 1–3 s), then deducts actual elapsed time.

---

