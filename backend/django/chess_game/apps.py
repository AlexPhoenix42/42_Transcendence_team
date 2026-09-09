# chess_game/apps.py

import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class GameConfig(AppConfig):
    name = 'chess_game'

    def ready(self):
        import threading
        threading.Timer(5.0, self._recover_ai_games).start()

    @staticmethod
    def _recover_ai_games():
        import threading
        import time

        try:
            # Reset all users to offline on startup
            # Active WebSocket connections will set them back online
            #from django.contrib.auth import get_user_model
            #User = get_user_model()
            #User.objects.filter(is_online=True).update(is_online=False)

            from django.core.cache import cache
            from chess_game.models import Game, GameStatus

            active_games = cache.get("active_games", set())

            for game_id_str in list(active_games):
                state = cache.get(f"game:{game_id_str}")
                if not state or state.get("status") != GameStatus.IN_PROGRESS:
                    continue

                try:
                    game = Game.objects.select_related("player1", "player2").get(pk=int(game_id_str))
                except Game.DoesNotExist:
                    continue

                p1_name = game.player1.username if game.player1 else ""
                p2_name = game.player2.username if game.player2 else ""

                if p1_name.startswith("stockfish_ai") and p2_name.startswith("stockfish_ai"):
                    from chess_game.ai_autoplay import run_ai_game
                    time.sleep(2)
                    threading.Thread(
                        target=run_ai_game,
                        args=(game.pk,),
                        daemon=True,
                    ).start()
                    logger.warning("Recovered AI vs AI game %s", game.pk)

        except Exception:
            logger.exception("Failed to recover AI games")

