import json
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from channels.routing import URLRouter
from channels.auth import AuthMiddlewareStack

from chess_game.models import Game
from chess_game.routing import websocket_urlpatterns

User = get_user_model()


# ----------------------------------------------------------------
# The communicator that already worked in our debug test.
# ----------------------------------------------------------------
class DebugCommunicator(WebsocketCommunicator):
    async def connect(self, timeout=5):
        try:
            connected, code = await super().connect(timeout)
        except AssertionError:
            # The parent consumed the response and raised AssertionError.
            # Read the actual frame from the output queue.
            try:
                self.first_frame = await self.receive_output(timeout=0.2)
            except Exception:
                self.first_frame = None

            if self.first_frame and self.first_frame.get("type") == "websocket.accept":
                connected = True
                code = None
            else:
                connected = False
                code = (
                    self.first_frame.get("code", 1000)
                    if self.first_frame
                    else 1000
                )
        return connected, code


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}},
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class FinalTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.p1 = User.objects.create_user(
            username="alice", email="alice@example.com", password="pass123"
        )
        self.p2 = User.objects.create_user(
            username="bob", email="bob@example.com", password="pass123"
        )
        self.p2_token = str(RefreshToken.for_user(self.p2).access_token)

        self.game = Game.objects.create(created_by=self.p1, player1=self.p1)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.p2_token}")
        resp = self.client.post(f"/api/games/{self.game.pk}/join/", {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.game.refresh_from_db()

        self.app = AuthMiddlewareStack(URLRouter(websocket_urlpatterns))

    async def _get_cookie(self, user):
        await sync_to_async(self.client.force_login)(user)
        return self.client.cookies["sessionid"].value

    def test_connect_and_initial_state(self):
        async def run():
            cookie = await self._get_cookie(self.p1)
            headers = [(b"cookie", f"sessionid={cookie}".encode())]

            comm = DebugCommunicator(
                self.app, f"/ws/game/{self.game.pk}/", headers=headers
            )
            connected, code = await comm.connect()

            self.assertTrue(connected,
                            f"Connection should be accepted, but got close code {code}")

            # Now the consumer sends the initial game state
            msg = await comm.receive_json_from()
            self.assertEqual(msg["type"], "game_state")
            self.assertIn("fen", msg)
            self.assertIn("crnt_turn", msg)

            await comm.disconnect()
        async_to_sync(run)()

