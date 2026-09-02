from django.db import IntegrityError
from django.test import TestCase
from django.contrib.auth import get_user_model

from chat.models import ChatRoom, RoomType, Message
from chat.seed import create_global_room

User = get_user_model()


class ChatRoomModelTests(TestCase):
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

    def test_dm_hash_uniqueness(self):
        """Direct creation of second DM room with same pair raises IntegrityError."""
        ChatRoom.objects.get_or_create_dm(self.user1.pk, self.user2.pk)
        with self.assertRaises(IntegrityError):
            ChatRoom.objects.create(
                room_type=RoomType.DM,
                dm_hash="1_2",
            )

    def test_get_or_create_dm_returns_existing(self):
        """Calling get_or_create_dm twice returns the same room."""
        room1 = ChatRoom.objects.get_or_create_dm(self.user1.pk, self.user2.pk)
        room2 = ChatRoom.objects.get_or_create_dm(self.user1.pk, self.user2.pk)
        self.assertEqual(room1.pk, room2.pk)
        self.assertEqual(room1.members.count(), 2)

    def test_global_room_uniqueness(self):
        """Only one GLOBAL room can exist."""
        ChatRoom.objects.get_or_create(room_type=RoomType.GLOBAL)  # use seeded room
        with self.assertRaises(IntegrityError):
            ChatRoom.objects.create(room_type=RoomType.GLOBAL)

    def test_tournament_room_uniqueness(self):
        """A tournament can have only one room."""
        ChatRoom.objects.create(
            room_type=RoomType.TOURNAMENT,
            tournament_id=42,
        )
        with self.assertRaises(IntegrityError):
            ChatRoom.objects.create(
                room_type=RoomType.TOURNAMENT,
                tournament_id=42,
            )

    def test_game_room_uniqueness(self):
        """A game can have only one room."""
        ChatRoom.objects.create(
            room_type=RoomType.GAME,
            game_id=99,
        )
        with self.assertRaises(IntegrityError):
            ChatRoom.objects.create(
                room_type=RoomType.GAME,
                game_id=99,
            )


class MessageModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="charlie",
            email="charlie@example.com",
            password="pass123",
        )
        self.room, _ = ChatRoom.objects.get_or_create(room_type=RoomType.GLOBAL)

    def test_message_ordering(self):
        """Messages are returned oldest-first by default."""
        Message.objects.create(
            room=self.room,
            sender=self.user,
            content="First",
        )
        Message.objects.create(
            room=self.room,
            sender=self.user,
            content="Second",
        )
        messages = list(Message.objects.all())
        self.assertEqual(messages[0].content, "First")
        self.assertEqual(messages[1].content, "Second")


class GlobalRoomSeedTests(TestCase):
    def test_create_global_room(self):
        create_global_room(sender=None)
        self.assertTrue(
            ChatRoom.objects.filter(room_type=RoomType.GLOBAL).exists()
        )

