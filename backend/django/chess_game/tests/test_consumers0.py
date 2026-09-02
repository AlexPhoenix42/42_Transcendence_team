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


@override_settings(
    CHANNEL_LAYERS={
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    },
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    },
)
class GameConsumerTests(TestCase):
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
        self.other = User.objects.create_user(
            username="eve", email="eve@example.com", password="pass123"
        )
        self.p1_token = str(RefreshToken.for_user(self.p1).access_token)
        self.p2_token = str(RefreshToken.for_user(self.p2).access_token)

        self.game = Game.objects.create(created_by=self.p1, player1=self.p1)
        self._join_game(self.game.pk, self.p2_token)
        self.game.refresh_from_db()
        # Make player1 always white for deterministic tests
        self.game.player1_color = True
        self.game.crnt_turn = self.p1
        self.game.save()

        # Seed Redis with the correct initial state
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

    # ---------- RELIABLE CONNECT HELPER ----------
    async def _get_communicator(self, user, game_id):
        cookie = await self._get_cookie(user)
        headers = [(b"cookie", f"sessionid={cookie}".encode())]
        communicator = WebsocketCommunicator(
            self.app, f"/ws/game/{game_id}/", headers=headers
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
    def test_anonymous_connection_rejected(self):
        async def run():
            communicator = WebsocketCommunicator(
                self.app, f"/ws/game/{self.game.pk}/"
            )
            connected, code = False, None
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
            self.assertFalse(connected)
            self.assertEqual(code, 4001)
            await communicator.disconnect()
        async_to_sync(run)()

    def test_authenticated_connection_accepted(self):
        async def run():
            comm, connected, _ = await self._get_communicator(self.p1, self.game.pk)
            self.assertTrue(connected)
            response = await comm.receive_json_from()
            self.assertEqual(response["type"], "game_state")
            await comm.disconnect()
        async_to_sync(run)()

    def test_non_player_rejected(self):
        async def run():
            comm, connected, code = await self._get_communicator(
                self.other, self.game.pk
            )
            self.assertFalse(connected)
            self.assertEqual(code, 4003)
            await comm.disconnect()
        async_to_sync(run)()

    # ------------------------------------------------------------------
    # Message handling tests
    # ------------------------------------------------------------------
    def test_send_valid_move_broadcast(self):
        async def run():
            comm1, connected1, _ = await self._get_communicator(self.p1, self.game.pk)
            self.assertTrue(connected1)
            _ = await comm1.receive_json_from()

            comm2, connected2, _ = await self._get_communicator(self.p2, self.game.pk)
            self.assertTrue(connected2)
            _ = await comm2.receive_json_from()

            with mock.patch(
                "chess_game.consumers.httpx.AsyncClient.post", new_callable=mock.AsyncMock
            ) as mock_post:
                mock_resp = mock.MagicMock()
                mock_resp.raise_for_status = mock.MagicMock()
                mock_resp.status_code = 200
                mock_resp.json = mock.AsyncMock(return_value={
                    "legal": True,
                    "check": False,
                    "checkmate": False,
                    "new_fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
                })
                mock_post.return_value = mock_resp

                await comm1.send_json_to({"from": "e2", "to": "e4"})
                resp1 = await comm1.receive_json_from()
                self.assertEqual(resp1["type"], "game_state")
                self.assertIn("4P3", resp1["fen"])
                self.assertEqual(resp1["crnt_turn"], self.p2.pk)

                resp2 = await comm2.receive_json_from()
                self.assertEqual(resp2["type"], "game_state")
                self.assertEqual(resp2["fen"], resp1["fen"])

            await comm1.disconnect()
            await comm2.disconnect()
        async_to_sync(run)()

    def test_send_invalid_json(self):
        async def run():
            comm, connected, _ = await self._get_communicator(self.p1, self.game.pk)
            self.assertTrue(connected)
            _ = await comm.receive_json_from()

            await comm.send_to(text_data="not json")
            response = await comm.receive_json_from()
            self.assertEqual(response["error"], "INVALID_JSON")
            await comm.disconnect()
        async_to_sync(run)()

    def test_send_missing_fields(self):
        async def run():
            comm, connected, _ = await self._get_communicator(self.p1, self.game.pk)
            self.assertTrue(connected)
            _ = await comm.receive_json_from()

            await comm.send_json_to({"from": "e2"})
            response = await comm.receive_json_from()
            self.assertEqual(response["error"], "MISSING_FIELDS")
            await comm.disconnect()
        async_to_sync(run)()

    def test_send_move_not_your_turn(self):
        async def run():
            comm, connected, _ = await self._get_communicator(
                self.p2, self.game.pk
            )
            self.assertTrue(connected)
            _ = await comm.receive_json_from()

            await comm.send_json_to({"from": "e7", "to": "e5"})
            response = await comm.receive_json_from()
            self.assertEqual(response["error"], "NOT_YOUR_TURN")
            await comm.disconnect()
        async_to_sync(run)()

    def test_engine_unavailable(self):
        async def run():
            comm, connected, _ = await self._get_communicator(self.p1, self.game.pk)
            self.assertTrue(connected)
            _ = await comm.receive_json_from()

            with mock.patch(
                "chess_game.consumers.httpx.AsyncClient.post", new_callable=mock.AsyncMock
            ) as mock_post:
                mock_post.side_effect = Exception("Connection refused")
                await comm.send_json_to({"from": "e2", "to": "e4"})
                response = await comm.receive_json_from()
                self.assertEqual(response["error"], "ENGINE_UNAVAILABLE")
            await comm.disconnect()
        async_to_sync(run)()

    def test_illegal_move(self):
        async def run():
            comm, connected, _ = await self._get_communicator(self.p1, self.game.pk)
            self.assertTrue(connected)
            _ = await comm.receive_json_from()

            with mock.patch(
                "chess_game.consumers.httpx.AsyncClient.post", new_callable=mock.AsyncMock
            ) as mock_post:
                mock_resp = mock.MagicMock()
                mock_resp.status_code = 200
                mock_resp.raise_for_status = mock.MagicMock()
                mock_resp.json = mock.AsyncMock(return_value={
                    "legal": False,
                    "check": False,
                    "checkmate": False,
                })
                mock_post.return_value = mock_resp

                await comm.send_json_to({"from": "e2", "to": "e5"})
                response = await comm.receive_json_from()
                self.assertEqual(response["error"], "ILLEGAL_MOVE")
            await comm.disconnect()
        async_to_sync(run)()

    def test_checkmate(self):
        async def run():
            comm1, connected1, _ = await self._get_communicator(self.p1, self.game.pk)
            self.assertTrue(connected1)
            _ = await comm1.receive_json_from()

            comm2, connected2, _ = await self._get_communicator(self.p2, self.game.pk)
            self.assertTrue(connected2)
            _ = await comm2.receive_json_from()

            with mock.patch(
                "chess_game.consumers.httpx.AsyncClient.post", new_callable=mock.AsyncMock
            ) as mock_post:
                mock_resp = mock.MagicMock()
                mock_resp.status_code = 200
                mock_resp.raise_for_status = mock.MagicMock()
                mock_resp.json = mock.AsyncMock(return_value={
                    "legal": True,
                    "check": True,
                    "checkmate": True,
                    "new_fen": "rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3",
                })
                mock_post.return_value = mock_resp

                await comm1.send_json_to({"from": "e2", "to": "e4"})

                resp1 = await comm1.receive_json_from()
                self.assertEqual(resp1["type"], "game_state")
                self.assertTrue(resp1["checkmate"])
                self.assertEqual(resp1["status"], GameStatus.FINISHED)

                resp1_over = await comm1.receive_json_from()
                self.assertEqual(resp1_over["type"], "game_over")
                self.assertEqual(resp1_over["winner"], self.p1.pk)
                self.assertEqual(resp1_over["reason"], GameResultReason.CHECKMATE)

                resp2 = await comm2.receive_json_from()
                self.assertEqual(resp2["type"], "game_state")
                resp2_over = await comm2.receive_json_from()
                self.assertEqual(resp2_over["type"], "game_over")

            await sync_to_async(self.game.refresh_from_db)()
            self.assertEqual(self.game.status, GameStatus.FINISHED)
            self.assertEqual(self.game.winner_id, self.p1.pk)
            self.assertEqual(self.game.result_reason, GameResultReason.CHECKMATE)

            await comm1.disconnect()
            await comm2.disconnect()
        async_to_sync(run)()

    def test_disconnect_clean(self):
        async def run():
            comm, connected, _ = await self._get_communicator(self.p1, self.game.pk)
            self.assertTrue(connected)
            await comm.disconnect()
        async_to_sync(run)()

