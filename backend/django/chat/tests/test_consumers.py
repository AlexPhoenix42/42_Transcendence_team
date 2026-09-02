import json

from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from asgiref.sync import async_to_sync, sync_to_async
from channels.testing import WebsocketCommunicator
from channels.routing import URLRouter
from channels.auth import AuthMiddlewareStack

from chat.models import ChatRoom, RoomType
from chat.routing import websocket_urlpatterns

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
class ChatConsumerTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="pass123",
        )
        self.user2 = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="pass123",
        )
        self.user3 = User.objects.create_user(
            username="charlie",
            email="charlie@example.com",
            password="pass123",
        )

        self.dm_room = ChatRoom.objects.get_or_create_dm(
            self.user1.pk, self.user2.pk
        )
        self.global_room, _ = ChatRoom.objects.get_or_create(room_type=RoomType.GLOBAL)

        self.app = AuthMiddlewareStack(URLRouter(websocket_urlpatterns))
        cache.clear()

    async def _get_cookie(self, user):
        await sync_to_async(self.client.force_login)(user)
        return self.client.cookies["sessionid"].value

    async def _get_communicator(self, user, room_id):
        cookie = await self._get_cookie(user)
        headers = [(b"cookie", f"sessionid={cookie}".encode())]
        communicator = WebsocketCommunicator(
            self.app, f"/ws/chat/{room_id}/", headers=headers
        )
        connected, code = await communicator.connect()
        return communicator, connected, code

    # ---------- Connection tests ----------
    def test_anonymous_connection_rejected(self):
        async def run():
            communicator = WebsocketCommunicator(
                self.app, f"/ws/chat/{self.global_room.pk}/"
            )
            connected, code = await communicator.connect()
            self.assertFalse(connected)
            self.assertEqual(code, 4001)
            await communicator.disconnect()
        async_to_sync(run)()

    def test_authenticated_connection_accepted(self):
        async def run():
            _, connected, _ = await self._get_communicator(
                self.user1, self.global_room.pk
            )
            self.assertTrue(connected)
        async_to_sync(run)()

    def test_dm_non_member_rejected(self):
        async def run():
            _, connected, code = await self._get_communicator(
                self.user3, self.dm_room.pk
            )
            self.assertFalse(connected)
            self.assertEqual(code, 4003)
        async_to_sync(run)()

    def test_dm_member_accepted(self):
        async def run():
            _, connected, _ = await self._get_communicator(
                self.user1, self.dm_room.pk
            )
            self.assertTrue(connected)
        async_to_sync(run)()

    # ---------- Message handling ----------
    def test_send_valid_message(self):
        async def run():
            comm, connected, _ = await self._get_communicator(
                self.user1, self.global_room.pk
            )
            self.assertTrue(connected)

            await comm.send_json_to({"content": "Hello!"})
            response = await comm.receive_json_from()
            self.assertEqual(response["content"], "Hello!")
            self.assertEqual(response["sender"], self.user1.username)
            self.assertIn("id", response)
            self.assertIn("created_at", response)

            await comm.disconnect()
        async_to_sync(run)()

    def test_broadcast_to_other_client(self):
        """Message sent by one user is received by another in the same room."""
        async def run():
            comm1, connected1, _ = await self._get_communicator(
                self.user1, self.global_room.pk
            )
            self.assertTrue(connected1)

            comm2, connected2, _ = await self._get_communicator(
                self.user2, self.global_room.pk
            )
            self.assertTrue(connected2)

            await comm1.send_json_to({"content": "Hello from alice"})
            # comm1 receives its own broadcast
            response1 = await comm1.receive_json_from()
            self.assertEqual(response1["content"], "Hello from alice")

            # comm2 also receives the broadcast
            response2 = await comm2.receive_json_from()
            self.assertEqual(response2["content"], "Hello from alice")
            self.assertEqual(response2["sender"], self.user1.username)

            await comm1.disconnect()
            await comm2.disconnect()
        async_to_sync(run)()

    def test_send_invalid_json(self):
        async def run():
            comm, connected, _ = await self._get_communicator(
                self.user1, self.global_room.pk
            )
            self.assertTrue(connected)

            await comm.send_to(text_data="not json")
            response = await comm.receive_json_from()
            self.assertIn("error", response)
            self.assertEqual(response["error"], "Invalid JSON")

            await comm.disconnect()
        async_to_sync(run)()

    def test_send_empty_content(self):
        async def run():
            comm, connected, _ = await self._get_communicator(
                self.user1, self.global_room.pk
            )
            self.assertTrue(connected)

            await comm.send_json_to({"content": "   "})
            response = await comm.receive_json_from()
            self.assertIn("error", response)

            await comm.disconnect()
        async_to_sync(run)()

    def test_send_content_too_long(self):
        async def run():
            comm, connected, _ = await self._get_communicator(
                self.user1, self.global_room.pk
            )
            self.assertTrue(connected)

            await comm.send_json_to({"content": "a" * 2001})
            response = await comm.receive_json_from()
            self.assertIn("error", response)

            await comm.disconnect()
        async_to_sync(run)()

    # ---------- Rate limiting ----------
    def test_rate_limit_exceeded(self):
        async def run():
            comm, connected, _ = await self._get_communicator(
                self.user1, self.global_room.pk
            )
            self.assertTrue(connected)

            for i in range(10):
                await comm.send_json_to({"content": f"msg{i}"})
                response = await comm.receive_json_from()
                self.assertNotIn("error", response)

            await comm.send_json_to({"content": "flood"})
            response = await comm.receive_json_from()
            self.assertIn("error", response)
            self.assertIn("Rate limit", response["error"])

            await comm.disconnect()
        async_to_sync(run)()

    def test_rate_limit_not_exceeded(self):
        async def run():
            comm, connected, _ = await self._get_communicator(
                self.user1, self.global_room.pk
            )
            self.assertTrue(connected)

            for i in range(5):
                await comm.send_json_to({"content": f"msg{i}"})
                response = await comm.receive_json_from()
                self.assertNotIn("error", response)

            await comm.disconnect()
        async_to_sync(run)()

    # ---------- Disconnect ----------
    def test_disconnect_clean(self):
        async def run():
            comm, connected, _ = await self._get_communicator(
                self.user1, self.global_room.pk
            )
            self.assertTrue(connected)
            await comm.disconnect()
        async_to_sync(run)()

