Here's the plan for your approval:

**Two pages needed:**

**1. ChessLobby (`/chess`)** — game management
- List open games (WAITING status) that you can join
- List your active games (IN_PROGRESS) you can resume
- Create game form: choose timer preset (unlimited, 3+2, 5+0, 10+5)
- Create AI game form: choose difficulty (easy/medium/hard) + timer
- Join button on open games
- Cancel button on your WAITING games
- Click an IN_PROGRESS game to go to `/chess/:id`

**2. ChessGame (`/chess/:id`)** — live gameplay
- Render an 8x8 board from FEN string
- Click piece to select, click square to move → sends `{from, to, promotion?}` via WebSocket
- Receive `game_state` updates (new FEN, turn, check, checkmate)
- Display clocks if timed game
- Show whose turn it is
- Show check/checkmate indicators
- Resign button → calls `POST /api/chess/:id/leave/`
- Game over screen showing winner and reason
- Promotion dialog when pawn reaches last rank

**Board rendering approach:**
- Parse FEN to get piece positions
- Render pieces using Unicode chess symbols (♔♕♖♗♘♙♚♛♜♝♞♟)
- No external chess library needed — backend handles all validation
- Board orientation flips based on your color

**WebSocket flow:**
- Connect to `ws/chat/<game_id>/` on page load
- Receive initial `game_state` with FEN
- On each move: send `{from, to}` → receive `game_state` update
- On `game_over` event → show result

**Questions:**
1. Do you want move highlighting (show legal moves when selecting a piece)? That would need client-side move generation or an API call.
2. Should I use unicode symbols or do you have piece images?
3. Any other features you want on the board?

