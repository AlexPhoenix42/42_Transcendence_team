import random
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tournament.models import (
    Tournament, TournamentParticipant, TournamentStatus,
    Match, MatchStatus,
)
from chat.models import ChatRoom, RoomType

User = get_user_model()


class TournamentChatSignalTests(TestCase):
    def test_chat_room_created_on_tournament_creation(self):
        """A ChatRoom with TOURNAMENT type is created automatically."""
        tournament = Tournament.objects.create(
            name="Signal Cup", max_players=4,
        )
        self.assertTrue(
            ChatRoom.objects.filter(
                room_type=RoomType.TOURNAMENT, tournament_id=tournament.pk,
            ).exists()
        )

    def test_chat_room_unique_per_tournament(self):
        """Only one chat room per tournament (constraint enforced)."""
        t = Tournament.objects.create(name="Unique Cup", max_players=2)
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            ChatRoom.objects.create(room_type=RoomType.TOURNAMENT, tournament_id=t.pk)


class TournamentAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user1 = User.objects.create_user(
            username="alice", email="alice@example.com", password="pass123",
        )
        self.user2 = User.objects.create_user(
            username="bob", email="bob@example.com", password="pass123",
        )
        self.user3 = User.objects.create_user(
            username="carol", email="carol@example.com", password="pass123",
        )
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com", password="pass123",
            is_staff=True,
        )
        self.admin_token = str(RefreshToken.for_user(self.admin).access_token)
        self.user1_token = str(RefreshToken.for_user(self.user1).access_token)
        self.user2_token = str(RefreshToken.for_user(self.user2).access_token)
        self.user3_token = str(RefreshToken.for_user(self.user3).access_token)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def _create_tournament(self, name="Test Cup", max_players=8):
        self._auth(self.admin_token)
        resp = self.client.post(
            "/api/tournaments/",
            {"name": name, "max_players": max_players},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        return resp.json()

    def _join(self, user_token, tournament_id):
        self._auth(user_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        return resp

    # ---------- Auth required ----------
    def test_unauthenticated_denied(self):
        urls = [
            ("/api/tournaments/", "get", [401, 403]),
            ("/api/tournaments/1/join/", "post", [401, 403]),
            ("/api/tournaments/1/leave/", "delete", [401, 403]),
            ("/api/tournaments/1/participants/", "get", [401, 403]),  # fixed
            ("/api/chat/rooms/global/", "get", [403]),
            ("/api/chat/rooms/tournament/1/", "get", [403]),
            ("/api/tournaments/1/start/", "post", [401, 403]),
        ]
        for url, method, expected_codes in urls:
            self.client.credentials()
            if method == "post":
                resp = self.client.post(url)
            elif method == "delete":
                resp = self.client.delete(url)
            else:
                resp = self.client.get(url)
            self.assertIn(resp.status_code, expected_codes,
                          msg=f"Unexpected status {resp.status_code} for {url}")

    # ---------- Nonexistent tournament ----------
    def test_nonexistent_tournament_returns_404(self):
        self._auth(self.user1_token)
        urls = [
            ("/api/tournaments/99999/join/", "post"),
            ("/api/tournaments/99999/leave/", "delete"),
            ("/api/tournaments/99999/participants/", "get"),
        ]
        for url, method in urls:
            if method == "post":
                resp = self.client.post(url)
            elif method == "delete":
                resp = self.client.delete(url)
            else:
                resp = self.client.get(url)
            self.assertEqual(resp.status_code, 404, msg=f"Expected 404 for {url}")

    def test_start_nonexistent_tournament_admin_404(self):
        """Admin gets 404 when starting a non‑existent tournament."""
        self._auth(self.admin_token)
        resp = self.client.post("/api/tournaments/99999/start/")
        self.assertEqual(resp.status_code, 404)

    # ---------- Admin creation ----------
    def test_admin_can_create_tournament(self):
        data = self._create_tournament()
        self.assertEqual(data["name"], "Test Cup")
        self.assertEqual(data["status"], TournamentStatus.OPEN)
        self.assertEqual(data["max_players"], 8)

    def test_non_admin_cannot_create(self):
        self._auth(self.user1_token)
        resp = self.client.post(
            "/api/tournaments/",
            {"name": "Hax Cup", "max_players": 4},
        )
        self.assertEqual(resp.status_code, 403)

    # ---------- Join ----------
    def test_join_open_tournament(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        resp = self._join(self.user1_token, tournament_id)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["player"], self.user1.username)

    def test_join_tournament_twice_fails(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        resp = self._join(self.user1_token, tournament_id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("already joined", resp.json()["error"])

    def test_join_full_tournament(self):
        data = self._create_tournament("Mini Cup", max_players=1)
        tournament_id = data["id"]
        self._join(self.admin_token, tournament_id)
        resp = self._join(self.user1_token, tournament_id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("full", resp.json()["error"])

    def test_join_ongoing_tournament_fails(self):
        """Cannot join a tournament that is already ONGOING."""
        data = self._create_tournament("Ongoing Cup", max_players=4)
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        self._join(self.user2_token, tournament_id)
        self._auth(self.admin_token)
        self.client.post(f"/api/tournaments/{tournament_id}/start/")
        # Now status is ONGOING
        self._auth(self.user3_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not open", resp.json()["error"])

    def test_join_finished_tournament_fails(self):
        """Cannot join a FINISHED tournament."""
        data = self._create_tournament("Finished Cup", max_players=2)
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        self._join(self.user2_token, tournament_id)
        Tournament.objects.filter(id=tournament_id).update(status=TournamentStatus.FINISHED)
        self._auth(self.user3_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not open", resp.json()["error"])

    def test_join_cancelled_tournament_fails(self):
        """Cannot join a CANCELLED tournament."""
        data = self._create_tournament("Cancelled Cup", max_players=2)
        tournament_id = data["id"]
        Tournament.objects.filter(id=tournament_id).update(status=TournamentStatus.CANCELLED)
        self._auth(self.user1_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not open", resp.json()["error"])

    # ---------- Leave ----------
    def test_leave_tournament(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        self._auth(self.user1_token)
        resp = self.client.delete(f"/api/tournaments/{tournament_id}/leave/")
        self.assertEqual(resp.status_code, 204)
        resp = self.client.get(f"/api/tournaments/{tournament_id}/participants/")
        self.assertEqual(len(resp.json()), 0)

    def test_leave_non_participant(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._auth(self.user1_token)
        resp = self.client.delete(f"/api/tournaments/{tournament_id}/leave/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not a participant", resp.json()["error"])

    def test_leave_closed_tournament_fails(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        Tournament.objects.filter(id=tournament_id).update(status=TournamentStatus.ONGOING)
        self._auth(self.user1_token)
        resp = self.client.delete(f"/api/tournaments/{tournament_id}/leave/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not open", resp.json()["error"])

    def test_leave_cancelled_tournament_fails(self):
        """Cannot leave a CANCELLED tournament."""
        data = self._create_tournament()
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        Tournament.objects.filter(id=tournament_id).update(status=TournamentStatus.CANCELLED)
        self._auth(self.user1_token)
        resp = self.client.delete(f"/api/tournaments/{tournament_id}/leave/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not open", resp.json()["error"])

    # ---------- Participants list ----------
    def test_participants_list(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        self._auth(self.user1_token)
        resp = self.client.get(f"/api/tournaments/{tournament_id}/participants/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]["player"], self.user1.username)

    # ---------- Room resolution endpoints ----------
    def test_global_room_resolve(self):
        self._auth(self.user1_token)
        resp = self.client.get("/api/chat/rooms/global/")
        self.assertIn(resp.status_code, [200, 403])
        if resp.status_code == 200:
            self.assertIn("room_id", resp.json())

    def test_tournament_room_resolve(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._auth(self.user1_token)
        resp = self.client.get(f"/api/chat/rooms/tournament/{tournament_id}/")
        self.assertIn(resp.status_code, [200, 403])
        if resp.status_code == 200:
            self.assertIn("room_id", resp.json())

    # ---------- Tournament creation validation ----------
    def test_create_tournament_missing_name(self):
        """Creating a tournament without a name returns 400."""
        self._auth(self.admin_token)
        resp = self.client.post(
            "/api/tournaments/",
            {"max_players": 4},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    # ---------- Start tournament ----------
    def test_start_tournament_success(self):
        data = self._create_tournament("Start Cup", max_players=4)
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        self._join(self.user2_token, tournament_id)
        self._join(self.user3_token, tournament_id)
        self._join(self.admin_token, tournament_id)
        self._auth(self.admin_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/start/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Tournament started", resp.json()["status"])
        matches = resp.json()["matches"]
        self.assertEqual(len(matches), 2)
        for m in matches:
            self.assertEqual(m["round_nb"], 1)
            self.assertEqual(m["status"], MatchStatus.PENDING)
        tournament = Tournament.objects.get(id=tournament_id)
        self.assertEqual(tournament.status, TournamentStatus.ONGOING)

    def test_start_tournament_with_bye(self):
        data = self._create_tournament("Bye Cup", max_players=4)
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        self._join(self.user2_token, tournament_id)
        self._join(self.user3_token, tournament_id)
        self._auth(self.admin_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/start/")
        self.assertEqual(resp.status_code, 200)
        matches = resp.json()["matches"]
        self.assertEqual(len(matches), 2)
        bye_matches = [m for m in matches if m["player2"] is None]
        self.assertEqual(len(bye_matches), 1)
        self.assertEqual(bye_matches[0]["status"], MatchStatus.FINISHED)
        self.assertIsNotNone(bye_matches[0]["winner"])

    def test_start_tournament_with_exactly_two_participants(self):
        """Boundary case: exactly two participants produce one match."""
        data = self._create_tournament("Two Player Cup", max_players=2)
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        self._join(self.user2_token, tournament_id)
        self._auth(self.admin_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/start/")
        self.assertEqual(resp.status_code, 200)
        matches = resp.json()["matches"]
        self.assertEqual(len(matches), 1)
        # order is random due to shuffle; just check both usernames are present
        self.assertIn(matches[0]["player1"], [self.user1.username, self.user2.username])
        self.assertIn(matches[0]["player2"], [self.user1.username, self.user2.username])
        self.assertNotEqual(matches[0]["player1"], matches[0]["player2"])

    def test_start_tournament_not_open(self):
        data = self._create_tournament("Started Cup", max_players=4)
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        self._join(self.user2_token, tournament_id)
        self._auth(self.admin_token)
        self.client.post(f"/api/tournaments/{tournament_id}/start/")
        resp = self.client.post(f"/api/tournaments/{tournament_id}/start/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not open", resp.json()["error"])

    def test_start_tournament_insufficient_participants(self):
        data = self._create_tournament("Solo Cup", max_players=4)
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        self._auth(self.admin_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/start/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("At least 2 participants", resp.json()["error"])

    def test_start_tournament_non_admin_forbidden(self):
        data = self._create_tournament("User Start Cup", max_players=4)
        tournament_id = data["id"]
        self._join(self.user1_token, tournament_id)
        self._join(self.user2_token, tournament_id)
        self._auth(self.user1_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/start/")
        self.assertEqual(resp.status_code, 403)

    # ---------- Match model constraint ----------
    def test_match_cannot_have_same_player_twice(self):
        """A match cannot have the same player as both player1 and player2."""
        tournament = Tournament.objects.create(name="Constraint Cup", max_players=2)
        with self.assertRaises(Exception):
            Match.objects.create(
                tournament=tournament,
                player1=self.user1,
                player2=self.user1,
                round_nb=1,
                status=MatchStatus.PENDING,
            )

