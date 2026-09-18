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

from chess_game.models import Game, GameStatus
from chess_game.routing import websocket_urlpatterns

User = get_user_model()


@override_settings(
    CHANNEL_LAYERS={
        "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}
    },
    CACHES={
        "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
    },
)
class GameConsumerEdgeTests(TestCase):
    def setUp(self):
        cache.clear()

        # Mock redis set operations used by views and consumer (active_games)
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
        self.p2 = User.objects.create_user(
            username="bob", email="bob@example.com", password="pass123"
        )
        self.p1_token = str(RefreshToken.for_user(self.p1).access_token)
        self.p2_token = str(RefreshToken.for_user(self.p2).access_token)

        self.game = Game.objects.create(created_by=self.p1, player1=self.p1)
        self._join_game(self.game.pk, self.p2_token)
        self.game.refresh_from_db()
        self.game.player1_color = True
        self.game.crnt_turn = self.p1
        self.game.save()

        game_key = f"game:{self.game.pk}"
        cache.set(game_key, {
            "fen": Game.INITIAL_FEN,
            "crnt_turn": self.p1.pk,
            "check": False,
            "checkmate": False,
            "status": GameStatus.IN_PROGRESS,
            "moves": [],
        }, timeout=86400)

        self.app = AuthMiddlewareStack(URLRouter(websocket_urlpatterns))

    def _join_game(self, game_id, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        resp = self.client.post(f"/api/games/{game_id}/join/", {}, format="json")
        self.assertEqual(resp.status_code, 200)

    async def _get_cookie(self, user):
        await sync_to_async(self.client.force_login)(user)
        return self.client.cookies["sessionid"].value

    async def _get_communicator(self, user, game_id):
        cookie = await self._get_cookie(user)
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

    # ------------------------------------------------------------------
    def test_redis_unavailable_on_move(self):
        """If Redis is empty, moving returns an error."""
        async def run():
            game_key = f"game:{self.game.pk}"
            cache.delete(game_key)

            comm, connected, _ = await self._get_communicator(self.p1, self.game.pk)
            self.assertTrue(connected)
            _ = await comm.receive_json_from()

            await comm.send_json_to({"from": "e2", "to": "e4"})
            response = await comm.receive_json_from()
            self.assertEqual(response["error"], "STATE_UNAVAILABLE")

            await comm.disconnect()
        async_to_sync(run)()

    def test_connect_when_redis_empty_falls_back_to_db(self):
        """If Redis is empty, the consumer uses the database state."""
        game_key = f"game:{self.game.pk}"
        cache.delete(game_key)

        async def run():
            comm, connected, _ = await self._get_communicator(self.p1, self.game.pk)
            self.assertTrue(connected)
            response = await comm.receive_json_from()
            self.assertEqual(response["type"], "game_state")
            self.assertEqual(response["fen"], Game.INITIAL_FEN)
            await comm.disconnect()
        async_to_sync(run)()

    def test_consecutive_turn_validation(self):
        """After a legal move, the turn toggles and the same player cannot move again."""
        async def run():
            comm1, connected1, _ = await self._get_communicator(self.p1, self.game.pk)
            self.assertTrue(connected1)
            _ = await comm1.receive_json_from()

            with mock.patch(
                "chess_game.consumers.httpx.AsyncClient.post", new_callable=mock.AsyncMock
            ) as mock_post:
                mock_resp = mock.MagicMock()
                mock_resp.status_code = 200
                mock_resp.raise_for_status = mock.MagicMock()
                mock_resp.json = mock.AsyncMock(return_value={
                    "legal": True,
                    "check": False,
                    "checkmate": False,
                    "new_fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
                })
                mock_post.return_value = mock_resp

                # White moves
                await comm1.send_json_to({"from": "e2", "to": "e4"})
                resp1 = await comm1.receive_json_from()
                self.assertEqual(resp1["type"], "game_state")

                # White tries again – fail
                await comm1.send_json_to({"from": "e4", "to": "e5"})
                resp2 = await comm1.receive_json_from()
                self.assertEqual(resp2["error"], "NOT_YOUR_TURN")

                # Black moves successfully
                comm2, connected2, _ = await self._get_communicator(self.p2, self.game.pk)
                self.assertTrue(connected2)
                _ = await comm2.receive_json_from()

                mock_resp.json = mock.AsyncMock(return_value={
                    "legal": True,
                    "check": False,
                    "checkmate": False,
                    "new_fen": "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
                })
                await comm2.send_json_to({"from": "e7", "to": "e5"})
                resp3 = await comm2.receive_json_from()
                self.assertEqual(resp3["type"], "game_state")
                self.assertIn("pppp1ppp", resp3["fen"])

            await comm1.disconnect()
            await comm2.disconnect()
        async_to_sync(run)()

