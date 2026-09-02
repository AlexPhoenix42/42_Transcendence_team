from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from asgiref.sync import async_to_sync, sync_to_async

from chess_game.models import Game
from chess_game.routing import websocket_urlpatterns

from channels.testing import WebsocketCommunicator
from channels.routing import URLRouter
from channels.auth import AuthMiddlewareStack

User = get_user_model()


class DebugCommunicator(WebsocketCommunicator):
    """A communicator that always captures the close frame."""
    rejection_response = None

    async def connect(self, timeout=5):
        try:
            connected, code = await super().connect(timeout)
        except AssertionError:
            # The rejection frame was consumed internally – grab it from the queue
            self.rejection_response = await self.receive_output(timeout=0.1)
            connected = False
            code = (
                self.rejection_response.get("code", "unknown")
                if self.rejection_response
                else "unknown"
            )
        return connected, code


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}},
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class DebugConnectTest(TestCase):
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

    def test_connect_as_valid_player(self):
        async def run():
            await sync_to_async(self.client.force_login)(self.p1)
            cookie = self.client.cookies["sessionid"].value
            headers = [(b"cookie", f"sessionid={cookie}".encode())]

            comm = DebugCommunicator(
                self.app, f"/ws/game/{self.game.pk}/", headers=headers
            )
            connected, code = await comm.connect()
            print(f"RESULT: connected={connected}, close_code={code}")
            if not connected and comm.rejection_response:
                print(f"REJECTION FRAME: {comm.rejection_response}")
            await comm.disconnect()

        async_to_sync(run)()

