from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from chat.models import ChatRoom, RoomType, Message

User = get_user_model()


class MessageListViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
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

        # Global room (any authenticated user)
        self.global_room, _ = ChatRoom.objects.get_or_create(room_type=RoomType.GLOBAL)
        self.msg1 = Message.objects.create(
            room=self.global_room,
            sender=self.user1,
            content="Hello world",
        )

        # DM room (only user1 and user2)
        self.dm_room = ChatRoom.objects.get_or_create_dm(
            self.user1.pk, self.user2.pk
        )
        self.msg2 = Message.objects.create(
            room=self.dm_room,
            sender=self.user1,
            content="Secret",
        )

        # Auth helper
        self.token = str(RefreshToken.for_user(self.user1).access_token)

    def _authenticate(self, user):
        """Helper to authenticate as a given user."""
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_unauthenticated_returns_401(self):
        """Requests without authentication are rejected."""
        url = f"/api/chat/rooms/{self.global_room.pk}/messages/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 401)

    def test_global_room_accessible_by_any_user(self):
        """Any authenticated user can access global room messages."""
        self._authenticate(self.user3)  # not a member of anything
        url = f"/api/chat/rooms/{self.global_room.pk}/messages/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_dm_room_accessible_by_member(self):
        """DM room is accessible by a member."""
        self._authenticate(self.user1)
        url = f"/api/chat/rooms/{self.dm_room.pk}/messages/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)

    def test_dm_room_denied_for_non_member(self):
        """DM room returns 403 for a non‑member."""
        self._authenticate(self.user3)
        url = f"/api/chat/rooms/{self.dm_room.pk}/messages/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_nonexistent_room_returns_404(self):
        """Non-existent room ID returns 404."""
        self._authenticate(self.user1)
        response = self.client.get("/api/chat/rooms/99999/messages/")
        self.assertEqual(response.status_code, 404)

    def test_pagination_default_page_size(self):
        """Default page size is 50."""
        # Create 55 messages in global room
        for i in range(55):
            Message.objects.create(
                room=self.global_room,
                sender=self.user1,
                content=f"Message {i}",
            )

        self._authenticate(self.user1)
        url = f"/api/chat/rooms/{self.global_room.pk}/messages/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.data)
        self.assertIn("count", response.data)
        self.assertIn("next", response.data)
        self.assertEqual(len(response.data["results"]), 50)  # first page
        self.assertIsNotNone(response.data["next"])  # more pages available

    def test_pagination_max_page_size(self):
        """Custom page_size parameter respects max_page_size = 100."""
        for i in range(120):
            Message.objects.create(
                room=self.global_room,
                sender=self.user1,
                content=f"Message {i}",
            )

        self._authenticate(self.user1)
        url = f"/api/chat/rooms/{self.global_room.pk}/messages/?page_size=150"
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        # max_page_size is 100, so even if we ask for 150 we get 100
        self.assertEqual(len(response.data["results"]), 100)

    def test_message_serializer_fields(self):
        """Response includes expected fields."""
        self._authenticate(self.user1)
        url = f"/api/chat/rooms/{self.global_room.pk}/messages/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        msg = response.data["results"][0]
        self.assertIn("id", msg)
        self.assertIn("sender", msg)
        self.assertIn("content", msg)
        self.assertIn("created_at", msg)
        self.assertEqual(msg["sender"], self.user1.username)

    def test_no_n_plus_one_queries(self):
        """Verify select_related prevents N+1 queries for sender."""
        # Create 10 messages by different users in global room
        for i in range(10):
            user = User.objects.create_user(
                username=f"user_{i}",
                email=f"user_{i}@example.com",
                password="pass123",
            )
            Message.objects.create(
                room=self.global_room,
                sender=user,
                content=f"Message {i}",
            )

        self._authenticate(self.user1)
        url = f"/api/chat/rooms/{self.global_room.pk}/messages/"

        # Only one query for messages + one for sender (select_related)
        with self.assertNumQueries(4):
            # 1) auth user fetch (middleware), 2) room check, 3) messages+users
            response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 11)  # 10 created + 1 existing

