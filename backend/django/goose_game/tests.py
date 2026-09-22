from django.test import TestCase
from django.contrib.auth import get_user_model
from .models import GooseGame, GoosePlayer, GooseGameStatus

User = get_user_model()


class GooseGameModelTest(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(username="player1", password="test", email="player1@example.com")
        self.user2 = User.objects.create_user(username="player2", password="test", email="player2@example.com")
        self.game = GooseGame.objects.create(
            created_by=self.user1,
            status=GooseGameStatus.WAITING,
        )

    def test_game_creation(self):
        self.assertEqual(self.game.status, GooseGameStatus.WAITING)
        self.assertEqual(self.game.created_by, self.user1)
        self.assertIsNone(self.game.winner)

    def test_game_player_creation(self):
        player = GoosePlayer.objects.create(
            game=self.game,
            user=self.user1,
            turn_order=0,
            position=0,
        )
        self.assertEqual(player.game, self.game)
        self.assertEqual(player.user, self.user1)
        self.assertEqual(player.position, 0)
        self.assertTrue(player.is_active)

    def test_multiple_players(self):
        p1 = GoosePlayer.objects.create(game=self.game, user=self.user1, turn_order=0, position=0)
        p2 = GoosePlayer.objects.create(game=self.game, user=self.user2, turn_order=1, position=0)
        self.assertEqual(self.game.players.count(), 2)

    def test_game_status_transition(self):
        self.game.status = GooseGameStatus.IN_PROGRESS
        self.game.save()
        self.assertEqual(self.game.status, GooseGameStatus.IN_PROGRESS)

    def test_wizard_pending_count(self):
        self.assertEqual(self.game.wizard_pending_count, 0)
        self.game.wizard_pending_count = 2
        self.game.save()
        self.game.refresh_from_db()
        self.assertEqual(self.game.wizard_pending_count, 2)
