from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tournament.models import (
    Tournament,
    TournamentParticipant,
    TournamentStatus,
    Match,
    MatchStatus,
)

User = get_user_model()


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    },
)
class TournamentMatchListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="pass123",
            is_staff=True,
        )
        self.p1 = User.objects.create_user(
            username="player1", email="p1@example.com", password="pass123"
        )
        self.p2 = User.objects.create_user(
            username="player2", email="p2@example.com", password="pass123"
        )
        self.p3 = User.objects.create_user(
            username="player3", email="p3@example.com", password="pass123"
        )
        self.p4 = User.objects.create_user(
            username="player4", email="p4@example.com", password="pass123"
        )
        self.admin_token = str(RefreshToken.for_user(self.admin).access_token)
        self.p1_token = str(RefreshToken.for_user(self.p1).access_token)
        self.p2_token = str(RefreshToken.for_user(self.p2).access_token)
        self.p3_token = str(RefreshToken.for_user(self.p3).access_token)
        self.p4_token = str(RefreshToken.for_user(self.p4).access_token)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def _create_tournament(self, max_players=4):
        self._auth(self.admin_token)
        resp = self.client.post(
            "/api/tournaments/",
            {"name": "Cup", "max_players": max_players},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        return resp.json()["id"]

    def _join(self, user_token, tid):
        self._auth(user_token)
        return self.client.post(f"/api/tournaments/{tid}/join/")

    def _start(self, tid):
        self._auth(self.admin_token)
        return self.client.post(f"/api/tournaments/{tid}/start/")

    # ---------- Authentication ----------
    def test_unauthenticated(self):
        tid = self._create_tournament()
        self.client.credentials()
        resp = self.client.get(f"/api/tournaments/{tid}/matches/")
        self.assertIn(resp.status_code, [401, 403])

    # ---------- Empty bracket ----------
    def test_no_matches_before_start(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        # tournament is OPEN, no matches exist
        self._auth(self.p1_token)
        resp = self.client.get(f"/api/tournaments/{tid}/matches/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

    # ---------- Bracket after start ----------
    def test_bracket_after_start(self):
        tid = self._create_tournament(max_players=4)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._join(self.p4_token, tid)
        self._start(tid)

        self._auth(self.p1_token)
        resp = self.client.get(f"/api/tournaments/{tid}/matches/")
        self.assertEqual(resp.status_code, 200)
        matches = resp.json()
        self.assertEqual(len(matches), 2)
        for m in matches:
            self.assertEqual(m["round_nb"], 1)
            self.assertEqual(m["status"], MatchStatus.PENDING)
            self.assertIsNone(m["winner"])

    # ---------- Bracket with bye ----------
    def test_bracket_with_bye(self):
        tid = self._create_tournament(max_players=3)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._start(tid)

        self._auth(self.p1_token)
        resp = self.client.get(f"/api/tournaments/{tid}/matches/")
        self.assertEqual(resp.status_code, 200)
        matches = resp.json()
        self.assertEqual(len(matches), 2)
        # One match is regular, one is a bye (player2 is None, FINISHED)
        bye = [m for m in matches if m["player2"] is None]
        self.assertEqual(len(bye), 1)
        self.assertEqual(bye[0]["status"], MatchStatus.FINISHED)
        self.assertIsNotNone(bye[0]["winner"])

    # ---------- After some results ----------
    def test_bracket_progression_visible(self):
        tid = self._create_tournament(max_players=4)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._join(self.p4_token, tid)
        self._start(tid)

        # Record one match result via admin
        round1 = list(
            Match.objects.filter(tournament_id=tid, round_nb=1).order_by("id")
        )
        self._auth(self.admin_token)
        self.client.patch(
            f"/api/tournaments/{tid}/matches/{round1[0].pk}/",
            {"winner": round1[0].player1_id},
            format="json",
        )

        self._auth(self.p1_token)
        resp = self.client.get(f"/api/tournaments/{tid}/matches/")
        self.assertEqual(resp.status_code, 200)
        matches = resp.json()
        # Still 2 matches (no round 2 yet)
        self.assertEqual(len(matches), 2)

    # ---------- Non-existent tournament ----------
    def test_non_existent_tournament(self):
        self._auth(self.p1_token)
        resp = self.client.get("/api/tournaments/99999/matches/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

