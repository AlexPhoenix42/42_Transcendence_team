from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from chess_game.models import Game, GameStatus, GameResultReason
from chess_game.serializers import GameSerializer

User = get_user_model()


class GameModelTests(TestCase):
    def test_create_game_defaults(self):
        """A newly created game has correct defaults."""
        player1 = User.objects.create_user(username="p1", password="pass")
        game = Game.objects.create(created_by=player1, player1=player1)
        self.assertEqual(game.status, GameStatus.WAITING)
        self.assertIsNone(game.player2)
        self.assertIsNone(game.winner)
        self.assertIsNone(game.result_reason)
        self.assertIsNone(game.crnt_turn)
        self.assertIsNone(game.player1_color)
        self.assertEqual(game.board_state, Game.INITIAL_FEN)
        self.assertEqual(game.moves, [])

    def test_player_not_self_constraint(self):
        """CheckConstraint prevents player1 == player2."""
        user = User.objects.create_user(username="p1", password="pass")
        with self.assertRaises(IntegrityError):
            Game.objects.create(
                created_by=user,
                player1=user,
                player2=user,
            )


class GameSerializerTests(TestCase):
    def setUp(self):
        self.p1 = User.objects.create_user(username="alice", password="pass")
        self.p2 = User.objects.create_user(username="bob", password="pass")
        self.game = Game.objects.create(created_by=self.p1, player1=self.p1)

    def test_serializer_fields(self):
        """Serializer includes all expected fields."""
        serializer = GameSerializer(self.game)
        data = serializer.data
        expected_fields = {
            "id", "player1", "player2", "player1_color", "status",
            "winner", "result_reason", "board_state", "moves",
            "crnt_turn", "created_by", "created_at", "updated_at",
        }
        self.assertEqual(set(data.keys()), expected_fields)

    def test_read_only_fields(self):
        """Read-only fields are not writable."""
        serializer = GameSerializer(data={
            "player1": self.p2.pk,
            "status": GameStatus.FINISHED,
            "winner": self.p2.pk,
        })
        # Even though data is passed, read-only fields are ignored and
        # validation fails because required writable fields are missing.
        self.assertFalse(serializer.is_valid())

    def test_string_related_fields(self):
        """User FK fields are serialized as usernames."""
        self.game.player2 = self.p2
        self.game.save()
        serializer = GameSerializer(self.game)
        self.assertEqual(serializer.data["player1"], self.p1.username)
        self.assertEqual(serializer.data["player2"], self.p2.username)

