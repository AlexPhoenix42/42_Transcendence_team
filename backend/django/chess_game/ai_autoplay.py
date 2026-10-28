# chess_game/ai_autoplay.py

import time
import logging
import random
import threading

import httpx

from channels.layers        import get_channel_layer
from asgiref.sync           import async_to_sync
from django.core.cache      import cache
from django.conf            import settings

from chess_game.models      import Game, GameStatus, GameResultReason
from chess_game.stats import update_player_stats

logger = logging.getLogger(__name__)

_stockfish_lock = threading.Lock()

MOVE_DELAY = 0.8


def _is_insufficient_material(fen: str) -> bool:
    board = fen.split(" ")[0]
    pieces = [ch for ch in board if ch.isalpha() and ch not in "Kk"]
    if len(pieces) == 0:
        return True
    if len(pieces) == 1 and pieces[0].lower() in ("b", "n"):
        return True
    if len(pieces) == 2 and pieces[0].lower() == "b" and pieces[1].lower() == "b":
        white_bishop_sq = None
        black_bishop_sq = None
        rank = 0
        file = 0
        for ch in board:
            if ch == "/":
                rank += 1
                file = 0
            elif ch.isdigit():
                file += int(ch)
            else:
                if ch == "B":
                    white_bishop_sq = (rank + file) % 2
                elif ch == "b":
                    black_bishop_sq = (rank + file) % 2
                file += 1
        if white_bishop_sq is not None and black_bishop_sq is not None:
            if white_bishop_sq == black_bishop_sq:
                return True
    return False


def run_ai_game(game_id: int):
    """
    Auto-play an AI vs AI game. Runs in a background thread.
    Fully synchronous — no async needed.
    """
    game_key = f"game:{game_id}"
    game_group = f"game_{game_id}"
    channel_layer = get_channel_layer()

    if channel_layer is None:
        logger.error("No channel layer for AI autoplay game %s", game_id)
        return

    broadcast = async_to_sync(channel_layer.group_send)

    try:
        game = Game.objects.select_related("player1", "player2").get(pk=game_id)
    except Game.DoesNotExist:
        logger.error("AI autoplay: game %s not found", game_id)
        return

    if game.status != GameStatus.IN_PROGRESS:
        logger.info("AI autoplay: game %s not in progress, skipping", game_id)
        return

    ai_difficulty = game.ai_difficulty or "medium"

    logger.warning("AI autoplay STARTED for game %s", game_id)

    while True:
        time.sleep(MOVE_DELAY)

        state = cache.get(game_key)
        if not state:
            logger.warning("AI autoplay: no state for game %s", game_id)
            break

        if state.get("status") != GameStatus.IN_PROGRESS:
            logger.info("AI autoplay: game %s finished", game_id)
            break

        current_fen = state["fen"]
        crnt_turn = state["crnt_turn"]
        p1_id = state["player1_id"]
        p2_id = state["player2_id"]
        opponent_id = p2_id if crnt_turn == p1_id else p1_id

        # Call Stockfish + engine (serialized)
        ai_data = None
        engine_data = None

        def _do_ai_move(fen, difficulty):
            nonlocal ai_data, engine_data

            with httpx.Client() as client:
                ai_resp = client.post(
                    settings.STOCKFISH_AI_URL,
                    json={"fen": fen, "difficulty": difficulty},
                    timeout=10.0,
                )
                ai_resp.raise_for_status()
                ai_data = ai_resp.json()

                move = ai_data.get("move")
                if  not move or move == "(none)":
                    return

                eng_resp = client.post(
                    settings.CHESS_ENGINE_URL,
                    json={"fen": fen, "move": move},
                    timeout=5.0,
                )
                eng_resp.raise_for_status()
                engine_data = eng_resp.json()

        try:
            with _stockfish_lock:
                _do_ai_move(current_fen, ai_difficulty)
        except Exception:
            logger.exception("AI autoplay: Stockfish/engine failed for game %s", game_id)
            break

        if not ai_data or not ai_data.get("move") or ai_data["move"] == "(none)":
            # Stalemate or no legal moves — random winner for AI vs AI
            logger.warning("AI autoplay: stalemate/no moves in game %s", game_id)
            random_winner = random.choice([p1_id, p2_id])
            state["status"] = GameStatus.FINISHED
            cache.set(game_key, state, timeout=86400)
            _finish_game_sync(game_id, random_winner, "STALEMATE")
            broadcast(game_group, {"type": "game_over", "winner": random_winner, "reason": "STALEMATE"})
            break

        move_uci = ai_data["move"]

        if not engine_data or not engine_data.get("legal"):
            logger.critical("AI autoplay: illegal move %s in game %s", move_uci, game_id)
            break

        # Re-read state
        state = cache.get(game_key)
        if not state or state.get("status") != GameStatus.IN_PROGRESS:
            break

        old_fen = state["fen"]
        new_fen = engine_data.get("new_fen")
        if new_fen is None:
            logger.error("AI autoplay: no new_fen for game %s", game_id)
            break

        # Threefold repetition
        fen_parts = new_fen.split(" ")
        pos_key = " ".join(fen_parts[:4])
        pos_counts: dict[str, int] = state.setdefault("position_counts", {})
        pos_counts[pos_key] = pos_counts.get(pos_key, 0) + 1

        if pos_counts[pos_key] >= 3:
            logger.warning("AI autoplay: threefold repetition game %s", game_id)
            random_winner = random.choice([p1_id, p2_id])
            state["fen"] = new_fen
            state["status"] = GameStatus.FINISHED
            cache.set(game_key, state, timeout=86400)
            _finish_game_sync(game_id, random_winner, "REPETITION")
            broadcast(game_group, {"type": "game_over", "winner": random_winner, "reason": "REPETITION"})
            break

        # 50-move rule
        halfmove = int(fen_parts[4]) if len(fen_parts) > 4 else 0
        if halfmove >= 100:
            logger.warning("AI autoplay: 50-move rule game %s", game_id)
            random_winner = random.choice([p1_id, p2_id])
            state["fen"] = new_fen
            state["status"] = GameStatus.FINISHED
            cache.set(game_key, state, timeout=86400)
            _finish_game_sync(game_id, random_winner, "50_MOVES")
            broadcast(game_group, {"type": "game_over", "winner": random_winner, "reason": "50_MOVES"})
            break

        # Apply move
        state["fen"] = new_fen
        state["check"] = engine_data.get("check", False)
        state["crnt_turn"] = opponent_id
        state["checkmate"] = engine_data.get("checkmate", False)

        move_from = move_uci[:2]
        move_to = move_uci[2:4]
        promotion = move_uci[4:5] if len(move_uci) > 4 else ""

        state.setdefault("moves", [])
        state["moves"].append({
            "from": move_from,
            "to": move_to,
            "promotion": promotion,
            "player": crnt_turn,
            "fen_before": old_fen,
        })

        state["last_move"] = {"from": move_from, "to": move_to}

        if engine_data.get("checkmate"):
            state["status"] = GameStatus.FINISHED
            state["winner"] = crnt_turn

        # Insufficient material
        if _is_insufficient_material(new_fen):
            logger.warning("AI autoplay: insufficient material game %s", game_id)
            random_winner = random.choice([p1_id, p2_id])
            state["status"] = GameStatus.FINISHED
            cache.set(game_key, state, timeout=86400)
            _finish_game_sync(game_id, random_winner, "INSUFFICIENT_MATERIAL")
            broadcast(game_group, {"type": "game_over", "winner": random_winner, "reason": "INSUFFICIENT_MATERIAL"})
            break

        # Clock
        now = time.time()
        if state.get("timer"):
            timer = state["timer"]
            clocks = state.setdefault("clocks", {
                str(p1_id): timer["init"],
                str(p2_id): timer["init"],
            })
            last_tick = state.get("last_tick", now)
            elapsed = now - last_tick
            mover_key = str(crnt_turn)
            if mover_key in clocks:
                clocks[mover_key] -= elapsed
                clocks[mover_key] += timer["inc"]
            state["clocks"] = clocks
            state["last_tick"] = now

        cache.set(game_key, state, timeout=86400)

        # Broadcast
        broadcast(game_group, {"type": "game_state_update", "state": state})

        # Checkmate
        if engine_data.get("checkmate"):
            _finish_game_sync(game_id, crnt_turn, GameResultReason.CHECKMATE)
            broadcast(game_group, {"type": "game_over", "winner": crnt_turn, "reason": GameResultReason.CHECKMATE})
            logger.warning("AI autoplay: game %s checkmate", game_id)
            break

    logger.warning("AI autoplay ENDED for game %s", game_id)


def _finish_game_sync(game_id: int, winner_id: int, reason: str):
    """Persist final state to DB using .save() to trigger signals."""
    redis_state = cache.get(f"game:{game_id}") or {}

    try:
        game = Game.objects.get(pk=game_id)
    except Game.DoesNotExist:
        return

    game.winner_id = winner_id  # type: ignore[attr-defined]
    game.result_reason = reason
    game.status = GameStatus.FINISHED
    game.board_state = redis_state.get("fen", Game.INITIAL_FEN)
    game.moves = redis_state.get("moves", [])
    game.save()  # triggers post_save signal → advances bracket

    update_player_stats(game)

    cache.delete(f"game:{game_id}")

    active_games = cache.get("active_games", set())
    active_games.discard(str(game_id))
    cache.set("active_games", active_games, timeout=None)

