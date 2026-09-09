# chess_game/consumers.py

from channels.generic.websocket             import AsyncWebsocketConsumer
from channels.db                            import database_sync_to_async

from django.core.cache                      import cache
from asgiref.sync                           import sync_to_async

from chess_game.models                      import Game, GameStatus, GameResultReason

from chess_game.stats                       import update_player_stats

from django.conf                            import settings


import time
import json
import httpx
import asyncio

import logging

logger = logging.getLogger(__name__)



class GameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        try:
            # Get authenticated user from scope (set by AuthMiddlewareStack)
            user    = self.scope.get("user")
            if  user is None or user.is_anonymous:
                await self.close(code=4001)
                return

            # Extract game_id from URL
            url_route   = self.scope.get("url_route")
            if  url_route is None:
                await self.close(code=4000)
                return

            kwargs = url_route.get("kwargs")
            if  kwargs is None:
                await self.close(code=4000)
                return

            game_id = kwargs.get("game_id")
            if  game_id is None:
                await self.close(code=4000)
                return

            self.user = user
            game = await self._get_and_validate_game(user, game_id)
            if  game is None:
                await self.close(code=4003)
                return

            self.game           = game
            self.game_id        = game_id
            self.is_spectator   = user not in [game.player1, game.player2]

            self.game_group_name   = f"game_{self.game_id}"
            await self.channel_layer.group_add(
                self.game_group_name,
                self.channel_name,
            )

            await self.accept()
            await self._send_game_state()

            # If it's AI's turn (AI is white, player is black), trigger AI first move
            #if  not self.is_spectator:
            #    game_key        = f"game:{self.game_id}"
            #    state           = await self._get_redis_hash(game_key)
            #    if  state and state.get("status") == GameStatus.IN_PROGRESS:
            #        ai_user_id  = await self._get_ai_user_id()
            #        if  ai_user_id is not None and str(state.get("crnt_turn") == str(ai_user_id)):
            #            await self._process_ai_turn(state)

            # If it's AI's turn (AI is white, player is black), trigger AI first move
            if  not self.is_spectator:
                game_key    = f"game:{self.game_id}"
                state       = await self._get_redis_hash(game_key)
                if  state and state.get("status") == GameStatus.IN_PROGRESS:
                    # Only trigger AI for Human vs AI, not AI vs AI
                    p1_name = await database_sync_to_async(lambda: self.game.player1.username if self.game.player1 else "")()
                    p2_name = await database_sync_to_async(lambda: self.game.player2.username if self.game.player2 else "")()
                    both_ai = p1_name.startswith("stockfish_ai") and p2_name.startswith("stockfish_ai")
                    if  not both_ai:
                        ai_user_id = await self._get_ai_user_id()
                        if  ai_user_id is not None and str(state.get("crnt_turn")) == str(ai_user_id):
                            await self._process_ai_turn(state)

                    #ai_user_id = await self._get_ai_user_id()
                    #logger.info(
                    #    "Game %s connect: crnt_turn=%s, ai_user_id=%s, user=%s, p1_color=%s",
                    #    self.game_id, state.get("crnt_turn"), ai_user_id, self.user.pk, self.game.player1_color
                    #)
                    #if  ai_user_id is not None and str(state.get("crnt_turn")) == str(ai_user_id):
                    #    await self._process_ai_turn(state)

            # Clear disconnect timestamp for this player (reconnection)
            game_key    = f"game:{self.game_id}"
            state       = await self._get_redis_hash(game_key)
            if  state and "disconnected" in state:
                state["disconnected"].pop(str(self.user.pk), None)
                await sync_to_async(cache.set)(game_key, state, timeout=86400)
            # ---------- original connect code ends here ----------
        except Exception:
            logger.exception("Connect crashed for user %s", self.scope.get("user"))
            await self.close(code=1011)
            return

    @database_sync_to_async
    def _get_and_validate_game(self, user, game_id) -> Game | None:
        try:
            game = Game.objects.select_related("player1", "player2", "crnt_turn").get(id=game_id)
        except Game.DoesNotExist:
            return None

        if  game.status != GameStatus.IN_PROGRESS:
            return None

        # this is removed to allowe spectators.
        #if  user not in [game.player1, game.player2]:
        #    return None

        return game


    async def _send_game_state(self):
        """Send the current game state to the connected client."""
        # Read live state from Redis
        game_key    = f"game:{self.game_id}"
        live_state  = await self._get_redis_hash(game_key)

        if  live_state and live_state.get("fen"):
            # Redis has live state, we use it
            state = live_state

        else:
            # Fall back to db state
            state = await self._get_db_game_state()


        payload = {
            "type"      : "game_state",
            "fen"       : state.get("fen", self.game.board_state),
            "crnt_turn" : state.get("crnt_turn", getattr(self.game.crnt_turn, "pk", None)),
            "check"     : state.get("check", False),
            "checkmate" : state.get("checkmate", False),
            "status"    : state.get("status", self.game.status),
        }

        if  state.get("clocks"):
            payload["clocks"] = state["clocks"]

        if state.get("timer"):
            payload["timer"] = state["timer"]

        if  state.get("is_practice"):
            payload["is_practice"] = True

        if  state.get("last_move"):
            payload["last_move"] = state["last_move"]

        await self.send(text_data=json.dumps(payload))
        #await self.send(text_data=json.dumps({
        #    "type"      : "game_state",
        #    "fen"       : state.get("fen", self.game.board_state),
        #    "crnt_turn" : state.get("crnt_turn", getattr(self.game.crnt_turn, "pk", None)),
        #    "check"     : state.get("check", False),
        #    "checkmate" : state.get("checkmate", False),
        #    "status"    : state.get("status", self.game.status),
        #}))


    async def _get_redis_hash(self, key: str) -> dict:
        """Return the Redis hash as a dict, or an empty dict."""
        try:
            data = await sync_to_async(cache.get)(key)
            if  data:
                # Refresh TTL to keep the key alive while game is active
                await sync_to_async(cache.set)(key, data, timeout=86400)
            return data if data else {}
        except Exception:
            logger.exception("Redis read failed for key %s", key)
            return {}


    @database_sync_to_async
    def _get_db_game_state(self) -> dict:
        game = self.game
        
        return {
            "fen"       : game.board_state,
            "crnt_turn" : game.crnt_turn.pk if game.crnt_turn else None,
            "check"     : False,
            "checkmate" : False,
            "status"    : game.status,
        }


    async def _rehydrate_state_from_db(self) -> dict:
        """Rebuild Redis state from the database if Redis key expired."""
        game = await database_sync_to_async(
            lambda: Game.objects.select_related("crnt_turn").get(pk=self.game_id)
        )()

        if  game.status != GameStatus.IN_PROGRESS:
            return {}

        # Build a minimal state from the database
        state = {
            "fen"           : game.board_state,
            "crnt_turn"     : game.crnt_turn.pk if game.crnt_turn else None,
            "check"         : False,
            "checkmate"     : False,
            "status"        : game.status,
            "moves"         : [],
            "disconnected"  : {},
            "player1_id"    : game.player1_id,
            "player2_id"    : game.player2_id,
        }

        # Re-create clocks if the game has a timer
        if  game.timer:
            try:
                init_min, inc_sec   = map(int, game.timer.split("+"))
                init_sec             = init_min * 60
                state["clocks"]     = {
                    str(game.player1_id):   init_sec,
                    str(game.player2_id):   init_sec,

                }
                state["last_tick"]  = time.time()
                state["timer"]      = {"init": init_sec, "inc": inc_sec}
            except ValueError:
                pass    # Invalid timer format, skip clocks

        logger.warning("Re-hydrated Redis state for game %s from DB", self.game_id)

        return state


    async def receive(self, text_data=None, bytes_data=None):
        # ── 0. Handle spectators ──────────────────────────────────────
        if  self.is_spectator:
            await self._send_error("SPECTATOR_READONLY")
            return


        # ── 1. Parse JSON ─────────────────────────────────────────────
        if  text_data is None:
            await self._send_error("EMPTY_MESSAGE")
            return

        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self._send_error("INVALID_JSON")
            return

        # ── Handle undo request ────────────────────────────────────────
        if  data.get("type") == "undo":
            await self._handle_undo()
            return

        # Handle set_fen request (practice mode only)
        if  data.get("type") == "set_fen":
            await self._handle_set_fen(data.get("fen", ""))
            return

        # ── 2. Validate required fields ─────────────────────────────────
        move_from   = data.get("from")
        move_to     = data.get("to")

        if not move_from or not move_to:
            await self._send_error("MISSING_FIELDS")
            return


        # ── 3. Promotion ─────────────────────────────────────────────────
        promotion   = data.get("promotion")
        move_str    = f"{move_from}{move_to}"
        if  promotion in ("q", "r", "b", "n"):
            move_str += promotion


        # ── 4. Read live state from Redis ─────────────────────────────────
        game_key    = f"game:{self.game_id}"
        state       = await self._get_redis_hash(game_key)

        # Must check state exists BEFORE checking status
        # If Redis key is missing, try to re-hydrate from the database
        if  not state or not state.get("fen"):
            state = await self._rehydrate_state_from_db()
            if  not state or not state.get("fen"):
                await self._send_error("STATE_UNAVAILABLE")
                return

            # Store the re-hydrated state in Redis
            await sync_to_async(cache.set)(game_key, state, timeout=86400)

        # Check if game is still on going...
        if  state.get("status") != GameStatus.IN_PROGRESS:
            await self._send_error("GAME_OVER")
            return


        # ── 5. Turn validation ────────────────────────────────────────────
        # only the player whose turn it is can move
        if  str(state.get("crnt_turn")) != str(self.user.pk):
            await self._send_error("NOT_YOUR_TURN")
            return


        # ── 6. Call the external chess engine ─────────────────────────────
        # Call the external chess engine
        try:
            async with httpx.AsyncClient() as client:
                engine_resp = await client.post(
                    settings.CHESS_ENGINE_URL,
                    json={"fen": state["fen"], "move": move_str},
                    timeout=2.0,
                )
                # Distinguish HTTP errors from connection errors
                if  engine_resp.status_code >= 400:
                    try:
                        err_body    = engine_resp.json()
                        engine_err  = err_body.get("error", "engine_error")
                    except Exception:   # noqa: BLE001
                        engine_err  = "engine_error"
                    await self._send_error("ENGINE_ERROR", detail=engine_err)

                    return

                engine_data = engine_resp.json()

        except (httpx.ConnectError, httpx.TimeoutException):
            logger.exception("Engine unreachable for game %s", self.game_id)
            await self._send_error("ENGINE_UNAVAILABLE")
            return

        except Exception:
            logger.exception("Engine unreachable for game %s", self.game_id)
            await self._send_error("ENGINE_UNAVAILABLE")
            return


        # ── 7. Process engine response ──────────────────────────────────
        # If the move is illegal, reject it
        if  not engine_data.get("legal"):
            await self._send_error("ILLEGAL_MOVE")
            return


        # ── 8. Re‑read status to avoid race with concurrent resignation ──
        #current_state = await self._get_redis_hash(game_key)
        #if  current_state.get("status") != GameStatus.IN_PROGRESS:
        #    await self._send_error("GAME_OVER")
        #    return
        state   = await self._get_redis_hash(game_key)
        if  not state or state.get("status") != GameStatus.IN_PROGRESS:
            await self._send_error("GAME_OVER")
            return


        # ── INSERT CLOCK UPDATE HERE ─────────────────────────────────────
        now = time.time()
        if  state.get("timer"):
            timer   = state["timer"]
            clocks  = state.setdefault("clocks",{
                str(self.game.player1_id): timer["init"],
                str(self.game.player2_id): timer["init"],
            })
            last_tick   = state.get("last_tick", now)
            elapsed     = now - last_tick

            mover_key   = str(self.user.pk)
            if  mover_key in clocks:
                clocks[mover_key] -= elapsed
                clocks[mover_key] += timer["inc"]

            state["clocks"]     = clocks
            state["last_tick"]  = now


        # ── 9. Update game state in Redis ─────────────────────────────────
        # Move is legal, update game state
        opponent    = self.game.player2 if self.user == self.game.player1 else self.game.player1
        opponent_id = opponent.pk

        # Update the in-memory state dict
        new_fen             = engine_data.get("new_fen")
        if  new_fen is None:
            await self._send_error("ENGINE_ERROR", detail="Engine response missing new_fen")
            return

                # ── Draw rule checks ─────────────────────────────────────────────
        fen_parts = new_fen.split(" ")
        position_key = " ".join(fen_parts[:4])

        pos_counts: dict[str, int] = state.setdefault("position_counts", {})
        pos_counts[position_key] = pos_counts.get(position_key, 0) + 1

        # Threefold repetition
        if pos_counts[position_key] >= 3:
            ai_user_id = await self._get_ai_user_id()
            if ai_user_id is not None:
                # Human vs AI: AI wins
                state["status"] = GameStatus.FINISHED
                state["fen"] = new_fen
                await sync_to_async(cache.set)(game_key, state, timeout=86400)
                await self._finish_game(ai_user_id, "REPETITION")
                await self.channel_layer.group_send(
                    self.game_group_name,
                    {"type": "game_over", "winner": ai_user_id, "reason": "REPETITION"},
                )
                return
            else:
                # Human vs Human: draw
                state["status"] = GameStatus.FINISHED
                state["fen"] = new_fen
                await sync_to_async(cache.set)(game_key, state, timeout=86400)
                await self._finish_game_draw()
                await self.channel_layer.group_send(
                    self.game_group_name,
                    {"type": "game_over", "winner": 0, "reason": "DRAW_REPETITION"},
                )
                return

        # 50-move rule
        halfmove = int(fen_parts[4]) if len(fen_parts) > 4 else 0
        if halfmove >= 100:
            ai_user_id = await self._get_ai_user_id()
            if ai_user_id is not None:
                state["status"] = GameStatus.FINISHED
                state["fen"] = new_fen
                await sync_to_async(cache.set)(game_key, state, timeout=86400)
                await self._finish_game(ai_user_id, "50_MOVES")
                await self.channel_layer.group_send(
                    self.game_group_name,
                    {"type": "game_over", "winner": ai_user_id, "reason": "50_MOVES"},
                )
                return
            else:
                state["status"] = GameStatus.FINISHED
                state["fen"] = new_fen
                await sync_to_async(cache.set)(game_key, state, timeout=86400)
                await self._finish_game_draw()
                await self.channel_layer.group_send(
                    self.game_group_name,
                    {"type": "game_over", "winner": 0, "reason": "DRAW_50_MOVES"},
                )
                return

        # Insufficient material
        from chess_game.ai_autoplay import _is_insufficient_material
        if _is_insufficient_material(new_fen):
            ai_user_id = await self._get_ai_user_id()
            if ai_user_id is not None:
                state["status"] = GameStatus.FINISHED
                state["fen"] = new_fen
                await sync_to_async(cache.set)(game_key, state, timeout=86400)
                await self._finish_game(ai_user_id, "INSUFFICIENT_MATERIAL")
                await self.channel_layer.group_send(
                    self.game_group_name,
                    {"type": "game_over", "winner": ai_user_id, "reason": "INSUFFICIENT_MATERIAL"},
                )
                return
            else:
                state["status"] = GameStatus.FINISHED
                state["fen"] = new_fen
                await sync_to_async(cache.set)(game_key, state, timeout=86400)
                await self._finish_game_draw()
                await self.channel_layer.group_send(
                    self.game_group_name,
                    {"type": "game_over", "winner": 0, "reason": "DRAW_INSUFFICIENT"},
                )
                return

        old_fen             = state["fen"]
        state["fen"]        = new_fen
        state["check"]      = engine_data.get("check", False)
        state["crnt_turn"]  = opponent_id
        state["checkmate"]  = engine_data.get("checkmate", False)

        if  engine_data.get("checkmate"):
            state["status"]     = GameStatus.FINISHED
            state["winner"]     = self.user.pk  # the player who just moved is the winner

        state.setdefault("moves", [])

        state["moves"].append({
            "from"          : move_from,
            "to"            : move_to,
            "player"        : self.user.pk,
            "fen_before"    : old_fen,
        })
        state["last_move"] = {"from": move_from, "to": move_to}

        # Save back to Redis
        try:
            await sync_to_async(cache.set)(game_key, state, timeout=86400)
        except Exception:
            logger.exception("Redis write failed for game %s", self.game_id)
            await self._send_error("STATE_SAVE_ERROR")
            return


        # ── 10. Broadcast new state ─────────────────────────────────────
        # Broadcast new state to both players
        await self.channel_layer.group_send(
            self.game_group_name,
            {
                "type"      : "game_state_update",
                "state"     : state,
            },
        )


        # ── 11. Checkmate finalisation ───────────────────────────────────
        # if checkmate, also persist to DB and send game-over
        if  engine_data.get("checkmate"):
            await self._finish_game(self.user.pk, GameResultReason.CHECKMATE)

            await self.channel_layer.group_send(
                self.game_group_name,
                {
                    "type"      : "game_over",
                    "winner"    : self.user.pk,
                    "reason"    : GameResultReason.CHECKMATE,
                },
            )

        # ── 12. AI turn ────────────────────────────────────────────────
        # If the next player is the AI, automatically request a move
        ai_user_id  = await self._get_ai_user_id()
        if  ai_user_id is not None \
            and str(state["crnt_turn"]) == str(ai_user_id) \
            and state.get("status")     == GameStatus.IN_PROGRESS :
            await self._process_ai_turn(state)

    async def _handle_undo(self):
        game_key    = f"game:{self.game_id}"
        state       = await self._get_redis_hash(game_key)

        if  not state or state.get("status") != GameStatus.IN_PROGRESS:
            await self._send_error("GAME_OVER")
            return

        if  not state.get("is_practice"):
            await self._send_error("PRACTICE_ONLY")
            return

        moves       = state.get("moves", [])
        if  not moves:
            await self._send_error("NO_MOVES")
            return

        last_move   = moves.pop()
        old_fen     = last_move.get("fen_before")

        if  not old_fen:
            await self._send_error("UNDO_UNAVAILABLE")
            return

        state["fen"]        = old_fen
        state["moves"]      = moves
        state["check"]      = False
        state["checkmate"]  = False
        state["status"]     = GameStatus.IN_PROGRESS

        # Update last_move to previous move or clear it
        if  moves:
            prev = moves[-1]
            state["last_move"] = {"from": prev["from"], "to": prev["to"]}
        else:
            state["last_move"] = None

        fen_turn           = old_fen.split(" ")[1]
        if  fen_turn == "w":
            state["crnt_turn"] = state["player1_id"] if self.game.player1_color else state["player2_id"]
        else:
            state["crnt_turn"] = state["player2_id"] if self.game.player1_color else state["player1_id"]

        await sync_to_async(cache.set)(game_key, state, timeout=86400)

        await self.channel_layer.group_send(
            self.game_group_name,
            {"type": "game_state_update", "state": state},
        )


    async def _handle_set_fen(self, fen: str):
        if  not fen or not fen.strip():
            await self._send_error("EMPTY_FEN")
            return

        game_key    = f"game:{self.game_id}"
        state       = await self._get_redis_hash(game_key)

        if  not state or state.get("status") != GameStatus.IN_PROGRESS:
            await self._send_error("GAME_OVER")
            return

        if  not state.get("is_practice"):
            await self._send_error("PRACTICE_ONLY")
            return

        fen         = fen.strip()

        state["fen"]            = fen
        state["check"]          = False
        state["checkmate"]      = False
        state["moves"]          = []

        fen_turn    = fen.split(" ")[1] if " " in fen else "w"
        if  fen_turn == "w":
            state["crnt_turn"] = state["player1_id"] if self.game.player1_color else state["player2_id"]
        else:
            state["crnt_turn"] = state["player2_id"] if self.game.player1_color else state["player1_id"]

        await sync_to_async(cache.set)(game_key, state, timeout=86400)

        await self.channel_layer.group_send(
            self.game_group_name,
            {"type": "game_state_update", "state": state},
        )



    async def _send_error(self, code: str, detail: str | None = None) -> None:
        """Send a structured error message to the current client."""
        payload = {"error": code}
        if  detail:
            payload["detail"] = detail
        await self.send(text_data=json.dumps(payload))

    #async def _get_ai_user_id(self) -> int | None:
    #    """Return the PK of the stockfish_ai user, or None if not found."""
    #    cache_key   = "_ai_user_id"
    #    ai_id      = await sync_to_async(cache.get)(cache_key)
    #    if  ai_id is None:
    #        ai_user = await database_sync_to_async(
    #            get_user_model().objects.filter(username="stockfish_ai").first
    #        )()

    #        if  ai_user:
    #            ai_id   = ai_user.pk
    #            await sync_to_async(cache.set)(cache_key, ai_id, timeout=3600)

    #    return ai_id

    async def _get_ai_user_id(self) -> int | None:
        """Return the PK of the AI player in this game, or None."""
        game = self.game
        p1_username = await database_sync_to_async(lambda: game.player1.username if game.player1 else None)()
        p2_username = await database_sync_to_async(lambda: game.player2.username if game.player2 else None)()

        if p1_username and p1_username.startswith("stockfish_ai"):
            return game.player1_id  # type: ignore[attr-defined]
        if p2_username and p2_username.startswith("stockfish_ai"):
            return game.player2_id  # type: ignore[attr-defined]
        return None


    async def _process_ai_turn(self, state: dict) -> None:
        """Ask Stockfish for a move, validate it, and apply it."""
        # Small artificial delay so the move doesnt feel instant
        await asyncio.sleep(0.2)

        game_key    = f"game:{self.game_id}"

        # Get the game's AI difficulty
        ai_difficulty   = await database_sync_to_async(
            lambda: self.game.ai_difficulty or "medium"
        )()

        # Call the AI engine
        try:
            async with httpx.AsyncClient() as client:
                ai_resp = await client.post(
                    settings.STOCKFISH_AI_URL,
                    json={"fen": state["fen"], "difficulty": ai_difficulty},
                    timeout=5.0
                )
                ai_resp.raise_for_status()
                ai_data = ai_resp.json()
        except Exception:
            logger.exception("AI engine call failed for game %s", self.game_id)
            await self._send_error("ENGINE_ERROR", detail="AI engine unavailable.")
            return

        move_uci    = ai_data.get("move")
        if  not move_uci or move_uci == "(none)":
            # Stalemate — AI can't move, human wins
            state["status"] = GameStatus.FINISHED
            state["fen"] = state["fen"]
            await sync_to_async(cache.set)(game_key, state, timeout=86400)
            await self._finish_game(self.user.pk, "STALEMATE")
            await self.channel_layer.group_send(
                self.game_group_name,
                {"type": "game_over", "winner": self.user.pk, "reason": "STALEMATE"},
            )
            return

        # Validate the AI move through the real engine (safety net)
        try:
            async with httpx.AsyncClient() as client:
                engine_resp = await client.post(
                    settings.CHESS_ENGINE_URL,
                    json={"fen": state["fen"], "move": move_uci},
                    timeout=2.0,
                )
                engine_resp.raise_for_status()
                engine_data = engine_resp.json()
        except Exception:
            logger.exception("Engine validation failed for AI move in game %s.", self.game_id)
            await self._send_error("ENGINE_ERROR", detail="Move validation failed.")
            return

        if  not engine_data.get("legal"):
            logger.critical("AI generated illegal move %s in game %s.", move_uci, self.game_id)
            await self._send_error("ENGINE_ERROR", detail="AI generated an illegal move")
            return

        # fetch AI user ID
        ai_user_id  = await self._get_ai_user_id()
        if  ai_user_id is None:
            logger.critical("AI user missing; aborting AI turn for game %s.", self.game_id)
            await self._send_error("ENGINE_ERROR", detail="AI user not found.")
            return

        # Apply the AI move to state
        new_fen             = engine_data.get("new_fen")
        if  new_fen is None:
            await self._send_error("ENGINE_ERROR", detail="Engine response missing new_fen")
            return

        # ── Draw rule checks (Human vs AI: AI wins) ──────────────────────
        fen_parts = new_fen.split(" ")
        position_key = " ".join(fen_parts[:4])

        pos_counts: dict[str, int] = state.setdefault("position_counts", {})
        pos_counts[position_key] = pos_counts.get(position_key, 0) + 1

        if pos_counts[position_key] >= 3:
            state["status"] = GameStatus.FINISHED
            state["fen"] = new_fen
            await sync_to_async(cache.set)(game_key, state, timeout=86400)
            await self._finish_game(ai_user_id, "REPETITION")
            await self.channel_layer.group_send(
                self.game_group_name,
                {"type": "game_over", "winner": ai_user_id, "reason": "REPETITION"},
            )
            return

        halfmove = int(fen_parts[4]) if len(fen_parts) > 4 else 0
        if halfmove >= 100:
            state["status"] = GameStatus.FINISHED
            state["fen"] = new_fen
            await sync_to_async(cache.set)(game_key, state, timeout=86400)
            await self._finish_game(ai_user_id, "50_MOVES")
            await self.channel_layer.group_send(
                self.game_group_name,
                {"type": "game_over", "winner": ai_user_id, "reason": "50_MOVES"},
            )
            return

        from chess_game.ai_autoplay import _is_insufficient_material
        if _is_insufficient_material(new_fen):
            state["status"] = GameStatus.FINISHED
            state["fen"] = new_fen
            await sync_to_async(cache.set)(game_key, state, timeout=86400)
            await self._finish_game(ai_user_id, "INSUFFICIENT_MATERIAL")
            await self.channel_layer.group_send(
                self.game_group_name,
                {"type": "game_over", "winner": ai_user_id, "reason": "INSUFFICIENT_MATERIAL"},
            )
            return

        old_fen             = state["fen"]
        state["fen"]        = new_fen
        state["check"]      = engine_data.get("check", False)
        state["crnt_turn"]  = self.user.pk  # back to human
        state["checkmate"]  = engine_data.get("checkmate", False)

        if  engine_data.get("checkmate"):
            state["status"] = GameStatus.FINISHED
            state["winner"] = ai_user_id

        move_from           = move_uci[:2]
        move_to             = move_uci[2:4]
        promotion           = move_uci[4:5] if len(move_uci) > 4 else ""

        state.setdefault("moves", [])

        state["moves"].append({
            "from"          : move_from,
            "to"            : move_to,
            "promotion"     : promotion,
            "player"        : ai_user_id,
            "fen_before"    : old_fen
        })
        state["last_move"] = {"from": move_from, "to": move_to}

        # clock update (if timed)
        now = time.time()
        if  state.get("timer"):
            timer   = state["timer"]
            clocks  = state.setdefault("clocks", {
                str(self.game.player1_id): timer["init"],
                str(self.game.player2_id): timer["init"],
            })
            last_tick   = state.get("last_tick", now)
            elapsed     = now - last_tick

            mover_key   = str(ai_user_id)
            if  mover_key in clocks:
                clocks[mover_key] -= elapsed
                clocks[mover_key] += timer["inc"]

            state["clocks"]     = clocks
            state["last_tick"]  = now

        # Persist to Redis
        try:
            await sync_to_async(cache.set)(game_key, state, timeout=86400)
        except Exception:
            logger.exception("Redis write failed for AI move in game %s.", self.game_id)
            await self._send_error("STATE_SAVE_ERROR")
            return

        # Broadcast
        await self.channel_layer.group_send(
            self.game_group_name,
            {"type": "game_state_update", "state": state},
        )

        # Checkmate finalization
        if  engine_data.get("checkmate"):
            await self._finish_game(ai_user_id, GameResultReason.CHECKMATE)
            await self.channel_layer.group_send(
                self.game_group_name,
                {"type": "game_over", "winner": ai_user_id, "reason": GameResultReason.CHECKMATE},
            )


    async def game_state_update(self, event):
        """Forward game state to WebSocket client."""
        state   = event["state"]
        payload = {
            "type"      : "game_state",
            "fen"       : state["fen"],
            "crnt_turn" : state["crnt_turn"],
            "check"     : state.get("check", False),
            "checkmate" : state.get("checkmate", False),
            "status"    : state.get("status", GameStatus.IN_PROGRESS),
        }
        if  state.get("clocks"):
            payload["clocks"] = state["clocks"]

        if  state.get("timer"):
            payload["timer"] = state["timer"]

        if  state.get("is_practice"):
            payload["is_practice"] = True

        if  state.get("last_move"):
            payload["last_move"] = state["last_move"]

        await self.send(text_data=json.dumps(payload))

        #await self.send(text_data=json.dumps({
        #    "type"      : "game_state",
        #    "fen"       : event["state"]["fen"],
        #    "crnt_turn" : event["state"]["crnt_turn"],
        #    "check"     : event["state"].get("check", False),
        #    "checkmate" : event["state"].get("checkmate", False),
        #    "status"    : event["state"].get("status", GameStatus.IN_PROGRESS),
        #}))


    async def game_over(self, event):
        """Forward game‑over event to WebSocket client."""
        await self.send(text_data=json.dumps({
            "type"      : "game_over",
            "winner"    : event["winner"],
            "reason"    : event["reason"],
        }))


    #@database_sync_to_async
    #def _finish_game(self, winner_id: int, reason: str) -> None:
    #    """Persist final state to the database."""
    #    redis_state = cache.get(f"game:{self.game_id}") or {}

    #    Game.objects.filter(pk=self.game_id).update(
    #        winner_id=winner_id,
    #        result_reason=reason,
    #        status=GameStatus.FINISHED,
    #        board_state=redis_state.get("fen", self.game.board_state),
    #        moves=redis_state.get("moves", []),
    #    )

    #    # Clear up Redis (without waiting for the 24h TTL)
    #    cache.delete(f"game:{self.game_id}")

    #    # Remove from active games set
    #    #redis_client = get_redis_connection("default")
    #    #redis_client.srem("active_games", self.game_id)
    #    active_games    = cache.get("active_games", set())
    #    active_games.discard(str(self.game_id))
    #    cache.set("active_games", active_games, timeout=None)

    #    #game                = self.game
    #    #game.winner_id      =  winner_id
    #    #game.result_reason  = reason
    #    #game.status         = GameStatus.FINISHED

    #    #redis_state         = cache.get(f"game:{self.game_id}") or {}
    #    #game.board_state    = redis_state.get("fen", game.board_state)

    #    #game.moves          = redis_state.get("moves", [])
    #    #game.save()

    @database_sync_to_async
    def _finish_game_draw(self) -> None:
        """Persist a drawn game to DB."""
        redis_state = cache.get(f"game:{self.game_id}") or {}

        try:
            game = Game.objects.get(pk=self.game_id)
        except Game.DoesNotExist:
            return

        game.winner = None
        game.result_reason = "DRAW"
        game.status = GameStatus.FINISHED
        game.board_state = redis_state.get("fen", game.board_state)
        game.moves = redis_state.get("moves", [])
        game.save()

        from chess_game.stats import update_player_stats
        update_player_stats(game)

        from chess_game.stats import update_player_stats
        update_player_stats(game)

        from chat.utils import notify_game_room
        notify_game_room(game.pk, "🤝 Game ended in a draw!")

        cache.delete(f"game:{self.game_id}")

        active_games = cache.get("active_games", set())
        active_games.discard(str(self.game_id))
        cache.set("active_games", active_games, timeout=None)

    @database_sync_to_async
    def _finish_game(self, winner_id: int, reason: str) -> None:
        """Persist final state to the database using .save() to trigger signals."""
        redis_state = cache.get(f"game:{self.game_id}") or {}

        try:
            game = Game.objects.get(pk=self.game_id)
        except Game.DoesNotExist:
            return

        game.winner_id      = winner_id     # type: ignore[misc]
        game.result_reason  = reason
        game.status         = GameStatus.FINISHED
        game.board_state    = redis_state.get("fen", game.board_state)
        game.moves          = redis_state.get("moves", [])
        game.save()  # triggers post_save signal → advances bracket

        update_player_stats(game)

        # Notify game chat
        from chat.utils import notify_game_room
        winner_name = game.winner.username if game.winner else None
        if reason == "CHECKMATE":
            notify_game_room(game.pk, f"♚ Checkmate! {winner_name} wins!")
        elif reason == "RESIGNATION":
            loser = game.player2 if game.winner == game.player1 else game.player1
            notify_game_room(game.pk, f"🏳️ {loser.username} resigned. {winner_name} wins!")
        elif reason == "STALEMATE":
            notify_game_room(game.pk, f"♚ Stalemate! {winner_name} wins!")
        elif reason in ("REPETITION", "50_MOVES", "INSUFFICIENT_MATERIAL"):
            notify_game_room(game.pk, f"🤝 Game ended: {reason.replace('_', ' ').title()}")

        cache.delete(f"game:{self.game_id}")

        active_games = cache.get("active_games", set())
        active_games.discard(str(self.game_id))
        cache.set("active_games", active_games, timeout=None)

    #async def disconnect(self, code):
    #    if  hasattr(self, "game_group_name"):
    #        await self.channel_layer.group_discard(
    #            self.game_group_name,
    #            self.channel_name,
    #        )


    async def disconnect(self, code):
        if  hasattr(self, "game_group_name"):
            if  not getattr(self, "is_spectator", False):
                # Record disconnect timestamp in Redis for timeout checker
                game_key    = f"game:{self.game_id}"
                state       = await self._get_redis_hash(game_key)
                if  state and state.get("status") == GameStatus.IN_PROGRESS:
                    state.setdefault("disconnected", {})
                    state["disconnected"][str(self.user.pk)] = time.time()
                    await sync_to_async(cache.set)(game_key, state, timeout=86400)

            # Still leave the channel group
            await self.channel_layer.group_discard(
                self.game_group_name,
                self.channel_name,
            )

