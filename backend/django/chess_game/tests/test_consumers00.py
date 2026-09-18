from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from channels.routing import URLRouter
from channels.auth import AuthMiddlewareStack
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from chess_game.models import Game
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
class DebugConsumerTest(TestCase):
    def test_connect_and_debug(self):
        async def run():
            client = APIClient()
            p1 = await sync_to_async(User.objects.create_user)(
                username="alice", email="alice@example.com", password="pass123"
            )
            p2 = await sync_to_async(User.objects.create_user)(
                username="bob", email="bob@example.com", password="pass123"
            )

            # Create game and join to make it IN_PROGRESS
            game = await sync_to_async(Game.objects.create)(created_by=p1, player1=p1)
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(p2).access_token}")
            resp = await sync_to_async(client.post)(f"/api/games/{game.pk}/join/", {}, format="json")
            assert resp.status_code == 200

            # Get session cookie for p1
            await sync_to_async(client.force_login)(p1)
            cookie = client.cookies["sessionid"].value
            headers = [(b"cookie", f"sessionid={cookie}".encode())]

            app = AuthMiddlewareStack(URLRouter(websocket_urlpatterns))
            communicator = WebsocketCommunicator(
                app, f"/ws/chess/{game.pk}/", headers=headers
            )

            try:
                connected, code = await communicator.connect()
                print(f"CONNECTED: {connected}, code={code}")
            except Exception as e:
                print(f"CONNECTION FAILED with exception: {type(e).__name__}: {e}")
                import traceback
                traceback.print_exc()
            finally:
                await communicator.disconnect()

        async_to_sync(run)()

