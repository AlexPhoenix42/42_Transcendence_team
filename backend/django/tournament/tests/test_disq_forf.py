from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from django.db import models

from tournament.models import (
    Tournament, TournamentParticipant, TournamentStatus,
    Match, MatchStatus,
)

User = get_user_model()


class ForfeitDisqualifyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="admin", email="admin@example.com",
            password="pass123", is_staff=True,
        )
        self.p1 = User.objects.create_user(
            username="player1", email="p1@example.com", password="pass123",
        )
        self.p2 = User.objects.create_user(
            username="player2", email="p2@example.com", password="pass123",
        )
        self.p3 = User.objects.create_user(
            username="player3", email="p3@example.com", password="pass123",
        )
        self.p4 = User.objects.create_user(
            username="player4", email="p4@example.com", password="pass123",
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

    def _forfeit(self, tid, token=None):
        if token is None:
            token = self.p1_token
        self._auth(token)
        return self.client.post(f"/api/tournaments/{tid}/forfeit/")

    def _disqualify(self, tid, player_id, token=None):
        if token is None:
            token = self.admin_token
        self._auth(token)
        return self.client.post(
            f"/api/tournaments/{tid}/disqualify/",
            {"player_id": player_id},
            format="json",
        )

    # ---------- Forfeit success ----------
    def test_forfeit_with_pending_match(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        resp = self._forfeit(tid)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "Forfeit Process")
        self.assertEqual(resp.json()["player"], self.p1.username)
        match = Match.objects.get(tournament_id=tid, round_nb=1)
        self.assertEqual(match.status, MatchStatus.FINISHED)
        self.assertEqual(match.winner, self.p2)
        # Player removed from tournament
        self.assertFalse(
            TournamentParticipant.objects.filter(
                tournament_id=tid, player=self.p1
            ).exists()
        )

    def test_forfeit_already_eliminated(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)
        # First forfeit – success
        self._forfeit(tid)
        # Second forfeit – tournament is now FINISHED, so "not in progress"
        resp = self._forfeit(tid)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not in progress", resp.json()["error"])

    def test_forfeit_non_participant(self):
        tid = self._create_tournament(max_players=3)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._start(tid)                     # ONGOING with p2 and p3
        # p1 is not a participant
        resp = self._forfeit(tid)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not a participant", resp.json()["error"])

    def test_forfeit_tournament_not_ongoing(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        # Tournament still OPEN
        resp = self._forfeit(tid)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not in progress", resp.json()["error"])

    # ---------- Disqualify success ----------
    def test_disqualify_success(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        resp = self._disqualify(tid, self.p1.pk)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "Disqualification Processed")
        match = Match.objects.get(tournament_id=tid, round_nb=1)
        self.assertEqual(match.winner, self.p2)
        self.assertFalse(
            TournamentParticipant.objects.filter(
                tournament_id=tid, player=self.p1
            ).exists()
        )

    def test_disqualify_invalid_player_id(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        resp = self._disqualify(tid, 99999)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("does not exist", resp.json()["error"])

    def test_disqualify_non_participant(self):
        tid = self._create_tournament(max_players=3)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._start(tid)
        resp = self._disqualify(tid, self.p1.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not a participant", resp.json()["error"])

    def test_disqualify_tournament_not_ongoing(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        # Still OPEN
        resp = self._disqualify(tid, self.p1.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not in progress", resp.json()["error"])

    # ---------- Bracket progression ----------
    def test_forfeit_final_match_finishes_tournament(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)
        self._forfeit(tid)
        tournament = Tournament.objects.get(pk=tid)
        self.assertEqual(tournament.status, TournamentStatus.FINISHED)

    def test_disqualify_final_match_finishes_tournament(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)
        self._disqualify(tid, self.p1.pk)
        tournament = Tournament.objects.get(pk=tid)
        self.assertEqual(tournament.status, TournamentStatus.FINISHED)

    def test_forfeit_with_bye_advances_winner(self):
        tid = self._create_tournament(max_players=3)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._start(tid)

        # Find the regular match (not the bye)
        regular = Match.objects.filter(
            tournament_id=tid, round_nb=1, player2__isnull=False
        ).first()
        # Forfeit as player1 of the regular match
        self._auth(self.p1_token if regular.player1 == self.p1 else self.p2_token)
        resp = self.client.post(f"/api/tournaments/{tid}/forfeit/")
        self.assertEqual(resp.status_code, 200)
        # A round‑2 match should exist
        self.assertEqual(
            Match.objects.filter(tournament_id=tid, round_nb=2).count(), 1
        )

    # ---------- Authentication ----------
    def test_forfeit_unauthenticated(self):
        tid = self._create_tournament(max_players=2)
        self.client.credentials()  # remove auth
        resp = self.client.post(f"/api/tournaments/{tid}/forfeit/")
        self.assertIn(resp.status_code, [401, 403])

    def test_disqualify_non_admin(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        self._auth(self.p1_token)
        resp = self.client.post(
            f"/api/tournaments/{tid}/disqualify/",
            {"player_id": self.p1.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    # ---------- Additional edge cases ----------
    def test_forfeit_tournament_cancelled(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)
        Tournament.objects.filter(pk=tid).update(status=TournamentStatus.CANCELLED)
        resp = self._forfeit(tid)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not in progress", resp.json()["error"])

    def test_disqualify_tournament_cancelled(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)
        Tournament.objects.filter(pk=tid).update(status=TournamentStatus.CANCELLED)
        resp = self._disqualify(tid, self.p1.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not in progress", resp.json()["error"])

    def test_disqualify_missing_player_id(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)
        self._auth(self.admin_token)
        resp = self.client.post(
            f"/api/tournaments/{tid}/disqualify/",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("player_id is required", resp.json()["error"])

    def test_disqualify_player_already_eliminated(self):
        """Player has no active matches while tournament is still ONGOING."""
        tid = self._create_tournament(max_players=4)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._join(self.p4_token, tid)
        self._start(tid)
        # player1 loses their match (record result via admin)
        match = Match.objects.filter(
            tournament_id=tid, round_nb=1,
        ).filter(
            models.Q(player1=self.p1) | models.Q(player2=self.p1)
        ).first()
        # Use admin to set opponent as winner (simulate normal result)
        match.winner = match.player2 if match.player1 == self.p1 else match.player1
        match.status = MatchStatus.FINISHED
        match.save()
        # Now p1 has no active matches, but tournament still ONGOING
        resp = self._disqualify(tid, self.p1.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("No active matches", resp.json()["error"])

    def test_forfeit_tournament_not_found(self):
        self._auth(self.p1_token)
        resp = self.client.post("/api/tournaments/99999/forfeit/")
        self.assertEqual(resp.status_code, 404)

    def test_disqualify_tournament_not_found(self):
        self._auth(self.admin_token)
        resp = self.client.post(
            "/api/tournaments/99999/disqualify/",
            {"player_id": self.p1.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)

