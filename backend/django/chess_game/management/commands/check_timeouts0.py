# game/management/commands/checkout_timeouts.py

from django.core.management.base    import BaseCommand

import redis

from asgiref.sync                   import async_to_sync
from channels.layers                import get_channel_layer

from chess_game.models               import GameStatus, GameResultReason, Game

import json
import os
import time
import logging

logger = logging.getLogger(__name__)

GRACE_PERIOD = 30 # seconds


class Command(BaseCommand):
    help = "Continuously checks active games for disconnected players and enforces forfeit."

    def handle(self, *args, **options):
        redis_client = redis.Redis(
            host=os.environ["REDIS_HOST"],
            port=int(os.environ["REDIS_PORT"]),
            db=2,   # dedicated redis namespace for the time checker
            decode_responses=True,
        )
        channel_layer   = get_channel_layer()

        assert channel_layer is not None, "channel layer is not configured."

        logger.info("Timeout checker started.")

        while True:
            try:
                game_ids    = redis_client.smembers("active_games")
                now         = time.time()

                for game_id in game_ids:    # type: ignore[attr-defined]
                    game_id = int(game_id) if isinstance(game_id, bytes) else game_id

                    game_key    = f"game:{game_id}"
                    state_raw = redis_client.get(game_key)    # type: ignore[attr-defined]

                    if state_raw is None:
                        redis_client.srem("active_games", game_id)
                        continue

                    # ── Time control check ──────────────────────────────
                    timer = state.get("timer")
                    if  timer:
                        last_tick = state.get("last_tick", now)
                        elapsed = now - last_tick

                        clocks = state.get("clocks", {})
                        turn_pk = state.get("crnt_turn")
                        turn_key = str(turn_pk) if turn_pk else None

                        if  turn_key and turn_key in clocks:
                            clocks[turn_key] -= elapsed
                            state["last_tick"] = now

                            if  clocks[turn_key] <= 0:
                                # Player whose turn it is loses by timeout
                                winner_id = self._determine_winner(state, turn_key)
                                if  winner_id is not None:
                                    self._finish_game(game_id, winner_id, state, reason=GameResultReason.TIMEOUT)

                                    async_to_sync(channel_layer.group_send)(
                                        f"game_{game_id}",
                                        {
                                            "type": "game_over",
                                            "winner": winner_id,
                                            "reason": GameResultReason.TIMEOUT,
                                        },
                                    )

                                    redis_client.srem("active_games", game_id)
                                    redis_client.delete(game_key)
                                    break

                    state = json.loads(state_raw)

                    disconnected    = state.get("disconnected", {}) or {}
                    if  not disconnected:
                        continue

                    for player_pk_str, timestamp in disconnected.items():
                        if  timestamp is None:
                            continue

                        elapsed = now - float(timestamp)
                        if  elapsed < GRACE_PERIOD:
                            continue

                        winner_id   = self._determine_winner(state, player_pk_str)

                        if  winner_id is None:
                            continue

                        self._finish_game(game_id, winner_id, state)

                        async_to_sync(channel_layer.group_send)(
                            f"game_{game_id}",
                            {
                                "type"      : "game_over",
                                "winner"    : winner_id,
                                "reason"    : GameResultReason.DISCONNECT,
                            },
                        )

                        redis_client.srem("active_games", game_id)
                        redis_client.delete(game_key)
                        break
            except Exception:
                logger.exception("Error in timeout checker loop")

            time.sleep(1)


    def _determine_winner(self, state:dict, loser_pk_str: str) -> int | None:
        loser_pk    = int(loser_pk_str)
        p1          = state.get("player1_id")
        p2          = state.get("player2_id")

        if  p1 == loser_pk:
            return p2
        elif p2 == loser_pk:
            return p1

        return None


    def _finish_game(self, game_id: int, winner_id: int, state: dict) -> None:
        try:
            Game.objects.filter(pk=game_id).update(
                winner_id= winner_id,
                #result_reason=GameResultReason.DISCONNECT,
                result_reason=reason,
                status=GameStatus.FINISHED,
                board_state=state.get("fen", ""),
                moves=state.get("moves", []),
            )
        except Exception:
            logger.exception("Failed to persist game %s on disconnect.", game_id)

