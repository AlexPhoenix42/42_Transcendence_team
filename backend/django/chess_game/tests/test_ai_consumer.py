# game/tests/test_ai_consumer.py

import json
from unittest import mock

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from channels.routing import URLRouter
from channels.auth import AuthMiddlewareStack
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.cache import cache

from chess_game.models import Game, GameStatus, GameResultReason
from chess_game.routing import websocket_urlpatterns

User = get_user_model()
AI_USERNAME = "stockfish_ai"


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}},
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class AIConsumerTests(TestCase):
    def setUp(self):
        cache.clear()

        # Mock redis set operations used by views/consumer (active_games)
        mock_redis = mock.MagicMock()
        mock_redis.sadd = mock.MagicMock()
        mock_redis.srem = mock.MagicMock()
        self._redis_patcher_views = mock.patch(
            "chess_game.views.get_redis_connection", return_value=mock_redis
        )
        self._redis_patcher_consumers = mock.patch(
            "chess_game.consumers.get_redis_connection", return_value=mock_redis
        )
        self._redis_patcher_views.start()
        self._redis_patcher_consumers.start()
        self.addCleanup(self._redis_patcher_views.stop)
        self.addCleanup(self._redis_patcher_consumers.stop)

        self.client = APIClient()
        self.p1 = User.objects.create_user(
            username="alice", email="alice@example.com", password="pass123"
        )
        self.ai_user, _ = User.objects.get_or_create(
            username=AI_USERNAME,
            defaults={"is_active": False, "email": "ai@ai.ai"},
        )

        # Base game: human vs AI, human to move
        self.game = Game.objects.create(
            created_by=self.p1,
            player1=self.p1,
            player2=self.ai_user,
            player2_is_ai=True,
            ai_difficulty="easy",
            status=GameStatus.IN_PROGRESS,
        )
        self.game.player1_color = True
        self.game.crnt_turn = self.p1
        self.game.save()

        # Seed Redis
        cache.set(
            f"game:{self.game.pk}",
            {
                "fen": Game.INITIAL_FEN,
                "crnt_turn": self.p1.pk,
                "check": False,
                "checkmate": False,
                "status": GameStatus.IN_PROGRESS,
                "moves": [],
            },
            timeout=86400,
        )

        self.app = AuthMiddlewareStack(URLRouter(websocket_urlpatterns))

    async def _connect(self, user, game_id):
        await sync_to_async(self.client.force_login)(user)
        cookie = self.client.cookies["sessionid"].value
        headers = [(b"cookie", f"sessionid={cookie}".encode())]
        communicator = WebsocketCommunicator(
            self.app, f"/ws/chess/{game_id}/", headers=headers
        )
        try:
            connected, code = await communicator.connect()
        except AssertionError:
            try:
                close_frame = await communicator.receive_output(timeout=0.5)
                connected = False
                code = close_frame.get("code", 1000) if close_frame else 1000
            except Exception:
                connected = False
                code = 1000
        return communicator, connected, code

    async def _collect_responses(self, comm, move_from="e2", move_to="e4"):
        """Send a move and collect all subsequent messages."""
        # skip initial state
        _ = await comm.receive_json_from()
        await comm.send_json_to({"from": move_from, "to": move_to})
        msgs = []
        for _ in range(4):
            try:
                msgs.append(await comm.receive_json_from(timeout=5))
            except Exception:
                break
        return msgs

    # ------------------------------------------------------------------
    def test_ai_engine_unreachable(self):
        """AI engine down → ENGINE_ERROR to human."""
        async def run():
            comm, connected, _ = await self._connect(self.p1, self.game.pk)
            self.assertTrue(connected)

            with mock.patch(
                "chess_game.consumers.httpx.AsyncClient.post", new_callable=mock.AsyncMock
            ) as mock_post:
                # human move success
                human = mock.MagicMock()
                human.status_code = 200
                human.json.return_value = {
                    "legal": True, "check": False, "checkmate": False,
                    "new_fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
                }
                # AI engine unreachable (raise_for_status raises)
                ai = mock.MagicMock()
                ai.raise_for_status.side_effect = Exception("Connection refused")

                async def side(*args, **kwargs):
                    url = kwargs.get("url", "") if "url" in kwargs else (args[0] if args else "")
                    return ai if "stockfish" in url else human

                mock_post.side_effect = side
                responses = await self._collect_responses(comm)

            self.assertTrue(
                any("ENGINE_ERROR" in r.get("error", "") for r in responses),
                "Should receive ENGINE_ERROR when AI is unreachable",
            )
        async_to_sync(run)()

    # ------------------------------------------------------------------
    def test_ai_returns_no_move(self):
        """AI returns {} → ENGINE_ERROR."""
        async def run():
            comm, connected, _ = await self._connect(self.p1, self.game.pk)
            self.assertTrue(connected)

            with mock.patch(
                "chess_game.consumers.httpx.AsyncClient.post", new_callable=mock.AsyncMock
            ) as mock_post:
                human = mock.MagicMock()
                human.status_code = 200
                human.json.return_value = {
                    "legal": True, "check": False, "checkmate": False,
                    "new_fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
                }
                ai = mock.MagicMock()
                ai.status_code = 200
                ai.json.return_value = {}  # no move
                ai.raise_for_status = mock.MagicMock()

                async def side(*args, **kwargs):
                    url = kwargs.get("url", "") if "url" in kwargs else (args[0] if args else "")
                    return ai if "stockfish" in url else human

                mock_post.side_effect = side
                responses = await self._collect_responses(comm)

            self.assertTrue(
                any("ENGINE_ERROR" in r.get("error", "") for r in responses),
                "Should receive ENGINE_ERROR when AI returns no move",
            )
        async_to_sync(run)()

    # ------------------------------------------------------------------
    def test_ai_illegal_move(self):
        """AI returns a move that the engine says is illegal → ENGINE_ERROR."""
        async def run():
            comm, connected, _ = await self._connect(self.p1, self.game.pk)
            self.assertTrue(connected)

            with mock.patch(
                "chess_game.consumers.httpx.AsyncClient.post", new_callable=mock.AsyncMock
            ) as mock_post:
                human = mock.MagicMock()
                human.status_code = 200
                human.json.return_value = {
                    "legal": True, "check": False, "checkmate": False,
                    "new_fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
                }
                ai_move = mock.MagicMock()
                ai_move.status_code = 200
                ai_move.json.return_value = {"move": "e7e8q"}
                ai_move.raise_for_status = mock.MagicMock()

                engine_illegal = mock.MagicMock()
                engine_illegal.status_code = 200
                engine_illegal.json.return_value = {
                    "legal": False, "check": False, "checkmate": False,
                }
                engine_illegal.raise_for_status = mock.MagicMock()

                call_count = 0
                async def side(*args, **kwargs):
                    nonlocal call_count
                    call_count += 1
                    url = kwargs.get("url", "") if "url" in kwargs else (args[0] if args else "")
                    if "stockfish" in url:
                        return ai_move
                    return human if call_count == 1 else engine_illegal

                mock_post.side_effect = side
                responses = await self._collect_responses(comm)

            self.assertTrue(
                any("ENGINE_ERROR" in r.get("error", "") for r in responses),
                "Should receive ENGINE_ERROR when AI move is illegal",
            )
        async_to_sync(run)()

    # ------------------------------------------------------------------
    def test_ai_normal_move(self):
        """Human moves → AI responds with a legal move → game continues."""
        async def run():
            comm, connected, _ = await self._connect(self.p1, self.game.pk)
            self.assertTrue(connected)

            with mock.patch(
                "chess_game.consumers.httpx.AsyncClient.post", new_callable=mock.AsyncMock
            ) as mock_post:
                human = mock.MagicMock()
                human.status_code = 200
                human.json.return_value = {
                    "legal": True, "check": False, "checkmate": False,
                    "new_fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
                }
                ai_move = mock.MagicMock()
                ai_move.status_code = 200
                ai_move.json.return_value = {"move": "e7e5"}
                ai_move.raise_for_status = mock.MagicMock()

                engine_legal = mock.MagicMock()
                engine_legal.status_code = 200
                engine_legal.json.return_value = {
                    "legal": True, "check": False, "checkmate": False,
                    "new_fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
                }
                engine_legal.raise_for_status = mock.MagicMock()

                call_count = 0
                async def side(*args, **kwargs):
                    nonlocal call_count
                    call_count += 1
                    url = kwargs.get("url", "") if "url" in kwargs else (args[0] if args else "")
                    if "stockfish" in url:
                        return ai_move
                    return human if call_count == 1 else engine_legal

                mock_post.side_effect = side
                responses = await self._collect_responses(comm)

            game_states = [r for r in responses if r.get("type") == "game_state"]
            self.assertGreaterEqual(len(game_states), 2, "Should receive human move + AI move")
            # The last game_state should be after AI move → crnt_turn should be human
            self.assertEqual(game_states[-1]["crnt_turn"], self.p1.pk)
        async_to_sync(run)()

    # ------------------------------------------------------------------
    def test_ai_checkmate(self):
        """AI delivers checkmate → game_over with AI as winner."""
        async def run():
            comm, connected, _ = await self._connect(self.p1, self.game.pk)
            self.assertTrue(connected)

            with mock.patch(
                "chess_game.consumers.httpx.AsyncClient.post", new_callable=mock.AsyncMock
            ) as mock_post:
                human = mock.MagicMock()
                human.status_code = 200
                human.json.return_value = {
                    "legal": True, "check": False, "checkmate": False,
                    "new_fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
                }
                ai_move = mock.MagicMock()
                ai_move.status_code = 200
                ai_move.json.return_value = {"move": "d8h4"}
                ai_move.raise_for_status = mock.MagicMock()

                engine_mate = mock.MagicMock()
                engine_mate.status_code = 200
                engine_mate.json.return_value = {
                    "legal": True, "check": True, "checkmate": True,
                    "new_fen": "rnb1kbnr/pppppppp/8/8/4P2q/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2",
                }
                engine_mate.raise_for_status = mock.MagicMock()

                call_count = 0
                async def side(*args, **kwargs):
                    nonlocal call_count
                    call_count += 1
                    url = kwargs.get("url", "") if "url" in kwargs else (args[0] if args else "")
                    if "stockfish" in url:
                        return ai_move
                    return human if call_count == 1 else engine_mate

                mock_post.side_effect = side
                responses = await self._collect_responses(comm)

            over = [r for r in responses if r.get("type") == "game_over"]
            self.assertTrue(len(over) > 0, "Should receive game_over after AI checkmate")
            if over:
                self.assertEqual(over[0]["winner"], self.ai_user.pk)
        async_to_sync(run)()

    # ------------------------------------------------------------------
    def test_ai_not_triggered_after_human_checkmate(self):
        """Human delivers checkmate → game_over, AI does NOT move."""
        async def run():
            comm, connected, _ = await self._connect(self.p1, self.game.pk)
            self.assertTrue(connected)

            with mock.patch(
                "chess_game.consumers.httpx.AsyncClient.post", new_callable=mock.AsyncMock
            ) as mock_post:
                human_mate = mock.MagicMock()
                human_mate.status_code = 200
                human_mate.json.return_value = {
                    "legal": True, "check": True, "checkmate": True,
                    "new_fen": "rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3",
                }
                mock_post.return_value = human_mate

                responses = await self._collect_responses(comm)

            over = [r for r in responses if r.get("type") == "game_over"]
            self.assertTrue(len(over) > 0, "Expected game_over from human checkmate")
            # There should be exactly one game_state (human move) + one game_over, no AI move
            game_states = [r for r in responses if r.get("type") == "game_state"]
            self.assertEqual(len(game_states), 1, "Only human move game_state expected, not AI")
        async_to_sync(run)()

