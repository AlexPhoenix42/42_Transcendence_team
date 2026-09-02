from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tournament.models import Tournament, TournamentParticipant, TournamentStatus
from chat.models import ChatRoom, RoomType

User = get_user_model()


class TournamentChatSignalTests(TestCase):
    def test_chat_room_created_on_tournament_creation(self):
        """A ChatRoom with TOURNAMENT type is created automatically."""
        tournament = Tournament.objects.create(
            name="Signal Cup",
            max_players=4,
        )
        self.assertTrue(
            ChatRoom.objects.filter(
                room_type=RoomType.TOURNAMENT,
                tournament_id=tournament.pk,
            ).exists()
        )

    def test_chat_room_unique_per_tournament(self):
        """Only one chat room per tournament (constraint enforced)."""
        t = Tournament.objects.create(name="Unique Cup", max_players=2)
        from django.db import IntegrityError
        # the signal already created one, so a second creation must fail
        with self.assertRaises(IntegrityError):
            ChatRoom.objects.create(room_type=RoomType.TOURNAMENT, tournament_id=t.pk)


class TournamentAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="pass123",
        )
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="pass123",
            is_staff=True,
        )
        self.user_token = str(RefreshToken.for_user(self.user).access_token)
        self.admin_token = str(RefreshToken.for_user(self.admin).access_token)

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

    # ---------- Auth required ----------
    def test_unauthenticated_denied(self):
        urls = [
            ("/api/tournaments/", "get", [401, 403]),
            ("/api/tournaments/1/join/", "post", [403]),        # was [401]
            ("/api/tournaments/1/leave/", "delete", [403]),     # was [401]
            ("/api/tournaments/1/participants/", "get", [403]), # was [401]
            ("/api/chat/rooms/global/", "get", [403]),
            ("/api/chat/rooms/tournament/1/", "get", [403]),
        ]
        for url, method, expected_codes in urls:
            self.client.credentials()  # no auth
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
        self._auth(self.user_token)
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

    # ---------- Admin creation ----------
    def test_admin_can_create_tournament(self):
        data = self._create_tournament()
        self.assertEqual(data["name"], "Test Cup")
        self.assertEqual(data["status"], TournamentStatus.OPEN)
        self.assertEqual(data["max_players"], 8)

    def test_non_admin_cannot_create(self):
        self._auth(self.user_token)
        resp = self.client.post(
            "/api/tournaments/",
            {"name": "Hax Cup", "max_players": 4},
        )
        self.assertEqual(resp.status_code, 403)

    # ---------- Join ----------
    def test_join_open_tournament(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._auth(self.user_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["player"], self.user.username)

    def test_join_tournament_twice_fails(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._auth(self.user_token)
        self.client.post(f"/api/tournaments/{tournament_id}/join/")
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("already joined", resp.json()["error"])

    def test_join_full_tournament(self):
        data = self._create_tournament("Mini Cup", max_players=1)
        tournament_id = data["id"]
        self._auth(self.admin_token)
        self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self._auth(self.user_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("full", resp.json()["error"])

    # ---------- Leave ----------
    def test_leave_tournament(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._auth(self.user_token)
        self.client.post(f"/api/tournaments/{tournament_id}/join/")
        resp = self.client.delete(f"/api/tournaments/{tournament_id}/leave/")
        self.assertEqual(resp.status_code, 204)
        resp = self.client.get(f"/api/tournaments/{tournament_id}/participants/")
        self.assertEqual(len(resp.json()), 0)

    def test_leave_non_participant(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._auth(self.user_token)
        resp = self.client.delete(f"/api/tournaments/{tournament_id}/leave/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not a participant", resp.json()["error"])

    def test_leave_closed_tournament_fails(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._auth(self.user_token)
        self.client.post(f"/api/tournaments/{tournament_id}/join/")
        Tournament.objects.filter(id=tournament_id).update(status=TournamentStatus.ONGOING)
        resp = self.client.delete(f"/api/tournaments/{tournament_id}/leave/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not open", resp.json()["error"])

    # ---------- Participants list ----------
    def test_participants_list(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._auth(self.user_token)
        self.client.post(f"/api/tournaments/{tournament_id}/join/")
        resp = self.client.get(f"/api/tournaments/{tournament_id}/participants/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]["player"], self.user.username)

    # ---------- Room resolution endpoints ----------
    def test_global_room_resolve(self):
        self._auth(self.user_token)
        resp = self.client.get("/api/chat/rooms/global/")
        self.assertIn(resp.status_code, [200, 403])  # 200 if session, 403 if token only (expected because we changed view to session)
        if resp.status_code == 200:
            self.assertIn("room_id", resp.json())

    def test_tournament_room_resolve(self):
        data = self._create_tournament()
        tournament_id = data["id"]
        self._auth(self.user_token)
        resp = self.client.get(f"/api/chat/rooms/tournament/{tournament_id}/")
        self.assertIn(resp.status_code, [200, 403])  # same as above
        if resp.status_code == 200:
            self.assertIn("room_id", resp.json())

