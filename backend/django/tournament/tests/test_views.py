from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tournament.models import Tournament, TournamentParticipant, TournamentStatus

User = get_user_model()

from django.test import override_settings

#@override_settings(
#    REST_FRAMEWORK={
#        'DEFAULT_THROTTLE_CLASSES': [],
#        'DEFAULT_THROTTLE_RATES': {},
#    }
#)

class TournamentAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Regular user
        self.user = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="pass123",
        )
        # Admin user
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="pass123",
            is_staff=True,
        )

        # Auth helpers
        self.user_token = str(RefreshToken.for_user(self.user).access_token)
        self.admin_token = str(RefreshToken.for_user(self.admin).access_token)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def _create_tournament(self, name="Test Cup", max_players=8):
        self._auth(self.admin_token)
        url = "/api/tournaments/"
        resp = self.client.post(
            url,
            {"name": name, "max_players": max_players},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        return resp.json()

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

        # First join
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self.assertEqual(resp.status_code, 201)

        # Second join
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("already joined", resp.json()["error"])

    def test_join_full_tournament(self):
        data = self._create_tournament("Mini Cup", max_players=1)
        tournament_id = data["id"]

        # Admin also joins (admin can join despite being staff; they are a user)
        self._auth(self.admin_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self.assertEqual(resp.status_code, 201)

        self._auth(self.user_token)
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("full", resp.json()["error"])

    # ---------- Leave ----------
    def test_leave_tournament(self):
        data = self._create_tournament()
        tournament_id = data["id"]

        self._auth(self.user_token)
        # Join first
        resp = self.client.post(f"/api/tournaments/{tournament_id}/join/")
        self.assertEqual(resp.status_code, 201)

        # Leave
        resp = self.client.delete(f"/api/tournaments/{tournament_id}/leave/")
        self.assertEqual(resp.status_code, 204)

        # Verify no longer a participant
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

        # Join, then change tournament status to ONGOING via admin
        self._auth(self.user_token)
        self.client.post(f"/api/tournaments/{tournament_id}/join/")

        # Admin manually sets status (we'll need an update endpoint later, but for test we can directly modify model)
        Tournament.objects.filter(id=tournament_id).update(status=TournamentStatus.ONGOING)

        resp = self.client.delete(f"/api/tournaments/{tournament_id}/leave/")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not open", resp.json()["error"])

    # ---------- Participants list ----------
    def test_participants_list(self):
        data = self._create_tournament()
        tournament_id = data["id"]

        # Join with user
        self._auth(self.user_token)
        self.client.post(f"/api/tournaments/{tournament_id}/join/")

        # List participants
        resp = self.client.get(f"/api/tournaments/{tournament_id}/participants/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]["player"], self.user.username)

