from datetime import timedelta
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import IntegrityError
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from unittest import mock

from chess_game.models import Game, GameStatus, GameResultReason
from chess_game.serializers import GameSerializer

User = get_user_model()


# ------------------------------------------------------------------------------
# Model tests
# ------------------------------------------------------------------------------
class GameModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.p1 = User.objects.create_user(
            username="p1", email="p1@example.com", password="pass"
        )
        cls.p2 = User.objects.create_user(
            username="p2", email="p2@example.com", password="pass"
        )

    def test_create_game_defaults(self):
        game = Game.objects.create(created_by=self.p1, player1=self.p1)
        self.assertEqual(game.status, GameStatus.WAITING)
        self.assertIsNone(game.player2)
        self.assertIsNone(game.winner)
        self.assertIsNone(game.result_reason)
        self.assertIsNone(game.crnt_turn)
        self.assertIsNone(game.player1_color)
        self.assertEqual(game.board_state, Game.INITIAL_FEN)
        self.assertEqual(game.moves, [])

    def test_player_not_self_constraint(self):
        with self.assertRaises(IntegrityError):
            Game.objects.create(
                created_by=self.p1,
                player1=self.p1,
                player2=self.p1,
            )

    def test_status_transitions(self):
        game = Game.objects.create(created_by=self.p1, player1=self.p1)
        game.status = GameStatus.IN_PROGRESS
        game.save()
        game.refresh_from_db()
        self.assertEqual(game.status, GameStatus.IN_PROGRESS)

        game.status = GameStatus.FINISHED
        game.save()
        game.refresh_from_db()
        self.assertEqual(game.status, GameStatus.FINISHED)

        game.status = GameStatus.CANCELLED
        game.save()
        game.refresh_from_db()
        self.assertEqual(game.status, GameStatus.CANCELLED)

    def test_winner_and_reason(self):
        game = Game.objects.create(created_by=self.p1, player1=self.p1, player2=self.p2)
        game.winner = self.p2
        game.result_reason = GameResultReason.RESIGNATION
        game.status = GameStatus.FINISHED
        game.save()
        game.refresh_from_db()
        self.assertEqual(game.winner, self.p2)
        self.assertEqual(game.result_reason, GameResultReason.RESIGNATION)

    def test_related_names(self):
        game = Game.objects.create(
            created_by=self.p1,
            player1=self.p1,
            player2=self.p2,
            winner=self.p1,
            crnt_turn=self.p1,
        )
        self.assertIn(game, self.p1.games_as_player1.all())
        self.assertIn(game, self.p2.games_as_player2.all())
        self.assertIn(game, self.p1.won_games.all())
        self.assertIn(game, self.p1.games_to_move.all())
        self.assertIn(game, self.p1.created_games.all())


# ------------------------------------------------------------------------------
# Serializer tests
# ------------------------------------------------------------------------------
class GameSerializerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.p1 = User.objects.create_user(
            username="alice", email="alice@example.com", password="pass"
        )
        cls.p2 = User.objects.create_user(
            username="bob", email="bob@example.com", password="pass"
        )

    def setUp(self):
        # Mock redis set operations used by GameJoinView
        mock_redis = mock.MagicMock()
        mock_redis.sadd = mock.MagicMock()
        mock_redis.srem = mock.MagicMock()
        self._redis_patcher = mock.patch(
            "chess_game.views.get_redis_connection", return_value=mock_redis
        )
        self._redis_patcher.start()
        self.addCleanup(self._redis_patcher.stop)
        self.game = Game.objects.create(created_by=self.p1, player1=self.p1)

    def test_serializer_fields(self):
        serializer = GameSerializer(self.game)
        data = serializer.data
        expected_fields = {
            "id", "player1", "player2", "player1_color", "status",
            "winner", "result_reason", "board_state", "moves",
            "crnt_turn", "created_by", "created_at", "updated_at",
        }
        self.assertEqual(set(data.keys()), expected_fields)

        def test_read_only_fields(self):
            """Serializer accepts empty data because all fields are read-only."""
            serializer = GameSerializer(data={})
            self.assertTrue(serializer.is_valid())

    def test_string_related_fields(self):
        self.game.player2 = self.p2
        self.game.save()
        serializer = GameSerializer(self.game)
        self.assertEqual(serializer.data["player1"], self.p1.username)
        self.assertEqual(serializer.data["player2"], self.p2.username)

    def test_serializer_with_winner(self):
        self.game.player2 = self.p2
        self.game.winner = self.p1
        self.game.save()
        serializer = GameSerializer(self.game)
        self.assertEqual(serializer.data["winner"], self.p1.username)

    def test_serializer_with_crnt_turn(self):
        self.game.player2 = self.p2
        self.game.crnt_turn = self.p1
        self.game.save()
        serializer = GameSerializer(self.game)
        self.assertEqual(serializer.data["crnt_turn"], self.p1.username)

    def test_serializer_null_fields(self):
        serializer = GameSerializer(self.game)
        self.assertIsNone(serializer.data["player2"])
        self.assertIsNone(serializer.data["winner"])
        self.assertIsNone(serializer.data["crnt_turn"])

    def test_serializer_board_state_and_moves(self):
        self.game.board_state = "test fen"
        self.game.moves = [{"from": "e2", "to": "e4"}]
        self.game.save()
        serializer = GameSerializer(self.game)
        self.assertEqual(serializer.data["board_state"], "test fen")
        self.assertEqual(serializer.data["moves"], [{"from": "e2", "to": "e4"}])

    def test_serializer_player1_color(self):
        self.game.player2 = self.p2
        self.game.player1_color = True
        self.game.save()
        serializer = GameSerializer(self.game)
        self.assertTrue(serializer.data["player1_color"])

    def test_serializer_result_reason(self):
        self.game.result_reason = GameResultReason.CHECKMATE
        self.game.save()
        serializer = GameSerializer(self.game)
        self.assertEqual(serializer.data["result_reason"], GameResultReason.CHECKMATE)


# ------------------------------------------------------------------------------
# API / View tests
# ------------------------------------------------------------------------------
@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    },
)
class GameAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Mock redis set operations used by GameJoinView / GameLeaveView
        mock_redis = mock.MagicMock()
        mock_redis.sadd = mock.MagicMock()
        mock_redis.srem = mock.MagicMock()
        self._redis_patcher = mock.patch(
            "chess_game.views.get_redis_connection", return_value=mock_redis
        )
        self._redis_patcher.start()
        self.addCleanup(self._redis_patcher.stop)

        self.p1 = User.objects.create_user(
            username="alice", email="alice@example.com", password="pass123"
        )
        self.p2 = User.objects.create_user(
            username="bob", email="bob@example.com", password="pass123"
        )
        self.p3 = User.objects.create_user(
            username="carol", email="carol@example.com", password="pass123"
        )
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="pass123",
            is_staff=True,
        )
        self.admin_token = str(RefreshToken.for_user(self.admin).access_token)
        self.p1_token = str(RefreshToken.for_user(self.p1).access_token)
        self.p2_token = str(RefreshToken.for_user(self.p2).access_token)
        self.p3_token = str(RefreshToken.for_user(self.p3).access_token)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def _create_game(self, token=None):
        if token is None:
            token = self.p1_token
        self._auth(token)
        resp = self.client.post("/api/games/", {}, format="json")
        self.assertEqual(resp.status_code, 201, msg=resp.data)
        return resp.json()

    def _join_game(self, game_id, token=None):
        if token is None:
            token = self.p2_token
        self._auth(token)
        return self.client.post(f"/api/games/{game_id}/join/", {}, format="json")

    def _cancel_game(self, game_id, token=None):
        if token is None:
            token = self.p1_token
        self._auth(token)
        return self.client.delete(f"/api/games/{game_id}/cancel/")

    def _leave_game(self, game_id, token=None):
        if token is None:
            token = self.p1_token
        self._auth(token)
        return self.client.post(f"/api/games/{game_id}/leave/", {}, format="json")

    # ========== Create ==========
    def test_create_game(self):
        data = self._create_game()
        self.assertEqual(data["player1"], self.p1.username)
        self.assertEqual(data["status"], GameStatus.WAITING)
        self.assertIsNone(data["player2"])
        self.assertIsNone(data["winner"])

    def test_create_unauthenticated(self):
        self.client.credentials()
        resp = self.client.post("/api/games/", {})
        self.assertIn(resp.status_code, [401, 403])

    # ========== List ==========
    def test_list_own_games(self):
        self._create_game(self.p1_token)
        self._auth(self.p1_token)
        resp = self.client.get("/api/games/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 1)

    def test_list_filter_by_status(self):
        self._create_game(self.p1_token)
        g = self._create_game(self.p2_token)
        self._join_game(g["id"], self.p1_token)
        self._auth(self.p1_token)
        resp = self.client.get("/api/games/?status=in_progress")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 1)

    def test_list_pagination(self):
        for _ in range(25):
            self._create_game(self.p1_token)
        self._auth(self.p1_token)
        resp = self.client.get("/api/games/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 20)
        self.assertIsNotNone(resp.data["next"])

    # ========== Join ==========
    def test_join_success(self):
        g = self._create_game()
        resp = self._join_game(g["id"])
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["player2"], self.p2.username)
        self.assertEqual(resp.data["status"], GameStatus.IN_PROGRESS)
        self.assertIsNotNone(resp.data["crnt_turn"])
        self.assertIn(resp.data["player1_color"], [True, False])

    def test_join_own_game(self):
        g = self._create_game()
        resp = self._join_game(g["id"], self.p1_token)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("own game", resp.data["error"])

    def test_join_non_waiting(self):
        g = self._create_game()
        self._join_game(g["id"])
        resp = self._join_game(g["id"], self.p3_token)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not waiting", resp.data["error"])

    def test_join_unauthenticated(self):
        g = self._create_game()
        self.client.credentials()
        resp = self.client.post(f"/api/games/{g['id']}/join/", {})
        self.assertIn(resp.status_code, [401, 403])

    # ========== Cancel ==========
    def test_cancel_success(self):
        g = self._create_game()
        resp = self._cancel_game(g["id"])
        self.assertEqual(resp.status_code, 204)
        game = Game.objects.get(pk=g["id"])
        self.assertEqual(game.status, GameStatus.CANCELLED)
        self.assertEqual(game.result_reason, GameResultReason.CANCELLED)

    def test_cancel_by_non_creator(self):
        g = self._create_game()
        resp = self._cancel_game(g["id"], self.p2_token)
        self.assertEqual(resp.status_code, 403)

    def test_cancel_non_waiting(self):
        g = self._create_game()
        self._join_game(g["id"])
        resp = self._cancel_game(g["id"])
        self.assertEqual(resp.status_code, 400)
        self.assertIn("WAITING", resp.data["error"])

    def test_cancel_unauthenticated(self):
        g = self._create_game()
        self.client.credentials()
        resp = self.client.delete(f"/api/games/{g['id']}/cancel/")
        self.assertIn(resp.status_code, [401, 403])

    # ========== Leave ==========
    def test_leave_success(self):
        g = self._create_game()
        self._join_game(g["id"])
        resp = self._leave_game(g["id"], self.p1_token)
        self.assertEqual(resp.status_code, 200)
        game = Game.objects.get(pk=g["id"])
        self.assertEqual(game.status, GameStatus.FINISHED)
        self.assertEqual(game.winner, self.p2)
        self.assertEqual(game.result_reason, GameResultReason.RESIGNATION)

    def test_leave_by_non_player(self):
        g = self._create_game()
        self._join_game(g["id"])
        resp = self._leave_game(g["id"], self.p3_token)
        self.assertEqual(resp.status_code, 403)

    def test_leave_non_in_progress(self):
        g = self._create_game()
        resp = self._leave_game(g["id"])
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not in progress", resp.data["error"])

    def test_leave_unauthenticated(self):
        g = self._create_game()
        self._join_game(g["id"])
        self.client.credentials()
        resp = self.client.post(f"/api/games/{g['id']}/leave/", {})
        self.assertIn(resp.status_code, [401, 403])

    # ========== Cleanup (admin) ==========
    def test_cleanup_stale_games(self):
        g1 = Game.objects.create(created_by=self.p1, player1=self.p1, status=GameStatus.WAITING)
        Game.objects.filter(pk=g1.pk).update(
            created_at=timezone.now() - timedelta(minutes=60))
        g2 = Game.objects.create(created_by=self.p2, player1=self.p2, status=GameStatus.WAITING)
        Game.objects.filter(pk=g2.pk).update(
            created_at=timezone.now() - timedelta(minutes=60))
        g3 = self._create_game(self.p1_token)
        g4 = self._create_game(self.p2_token)
        self._join_game(g4["id"], self.p1_token)

        self._auth(self.admin_token)
        resp = self.client.post("/api/games/cleanup/", {"timeout": 30}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["cancelled"], 2)

        self.assertEqual(Game.objects.get(pk=g1.pk).status, GameStatus.CANCELLED)
        self.assertEqual(Game.objects.get(pk=g2.pk).status, GameStatus.CANCELLED)
        self.assertEqual(Game.objects.get(pk=g3["id"]).status, GameStatus.WAITING)
        self.assertEqual(Game.objects.get(pk=g4["id"]).status, GameStatus.IN_PROGRESS)

    def test_cleanup_non_admin(self):
        self._auth(self.p1_token)
        resp = self.client.post("/api/games/cleanup/", {}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_cleanup_unauthenticated(self):
        self.client.credentials()
        resp = self.client.post("/api/games/cleanup/", {}, format="json")
        self.assertIn(resp.status_code, [401, 403])

    def test_cleanup_default_timeout(self):
        g = Game.objects.create(created_by=self.p1, player1=self.p1, status=GameStatus.WAITING)
        Game.objects.filter(pk=g.pk).update(created_at=timezone.now() - timedelta(minutes=31))
        self._auth(self.admin_token)
        resp = self.client.post("/api/games/cleanup/", {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["cancelled"], 1)
        self.assertEqual(Game.objects.get(pk=g.pk).status, GameStatus.CANCELLED)

    # ========== stress / edge cases ==========
    def test_create_many_games(self):
        for _ in range(50):
            self._create_game(self.p1_token)
        self._auth(self.p1_token)
        resp = self.client.get("/api/games/")
        self.assertEqual(resp.status_code, 200)

    def test_join_already_cancelled(self):
        g = self._create_game()
        self._cancel_game(g["id"])
        resp = self._join_game(g["id"])
        self.assertEqual(resp.status_code, 400)

    def test_leave_already_finished(self):
        g = self._create_game()
        self._join_game(g["id"])
        self._leave_game(g["id"], self.p1_token)
        resp = self._leave_game(g["id"], self.p2_token)
        self.assertEqual(resp.status_code, 400)

    def test_cancel_already_cancelled(self):
        g = self._create_game()
        self._cancel_game(g["id"])
        resp = self._cancel_game(g["id"])
        self.assertEqual(resp.status_code, 400)

