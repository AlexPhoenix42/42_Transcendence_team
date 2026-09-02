from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from tournament.models import (
    Tournament, TournamentParticipant, TournamentStatus,
    Match, MatchStatus,
)

User = get_user_model()

from django.test import override_settings

#@override_settings(
#    REST_FRAMEWORK={
#        'DEFAULT_THROTTLE_CLASSES': [],
#        'DEFAULT_THROTTLE_RATES': {},
#    }
#)

class MatchResultUpdateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        # Admin user
        self.admin = User.objects.create_user(
            username="admin",
            email="admin@example.com",
            password="pass123",
            is_staff=True,
        )
        # Players
        self.p1 = User.objects.create_user(
            username="player1",
            email="p1@example.com",
            password="pass123",
        )
        self.p2 = User.objects.create_user(
            username="player2",
            email="p2@example.com",
            password="pass123",
        )
        self.p3 = User.objects.create_user(
            username="player3",
            email="p3@example.com",
            password="pass123",
        )
        self.p4 = User.objects.create_user(
            username="player4",
            email="p4@example.com",
            password="pass123",
        )
        self.admin_token = str(RefreshToken.for_user(self.admin).access_token)
        self.p1_token = str(RefreshToken.for_user(self.p1).access_token)
        self.p2_token = str(RefreshToken.for_user(self.p2).access_token)
        self.p3_token = str(RefreshToken.for_user(self.p3).access_token)
        self.p4_token = str(RefreshToken.for_user(self.p4).access_token)

    def _auth(self, token):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def _create_tournament(self, name="Cup", max_players=4):
        self._auth(self.admin_token)
        resp = self.client.post(
            "/api/tournaments/",
            {"name": name, "max_players": max_players},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        return resp.json()["id"]

    def _join(self, user_token, tournament_id):
        self._auth(user_token)
        return self.client.post(f"/api/tournaments/{tournament_id}/join/")

    def _start(self, tournament_id):
        self._auth(self.admin_token)
        return self.client.post(f"/api/tournaments/{tournament_id}/start/")

    def _record_result(self, tournament_id, match_id, winner_id, token=None):
        if token is None:
            token = self.admin_token
        self._auth(token)
        return self.client.patch(
            f"/api/tournaments/{tournament_id}/matches/{match_id}/",
            {"winner": winner_id},
            format="json",
        )

    # ---------- Successful match recording ----------
    def test_record_result_success(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        match = Match.objects.get(tournament_id=tid, round_nb=1)
        resp = self._record_result(tid, match.pk, self.p1.pk)
        self.assertEqual(resp.status_code, 200)
        match.refresh_from_db()
        self.assertEqual(match.status, MatchStatus.FINISHED)
        self.assertEqual(match.winner, self.p1)

    # ---------- Error cases ----------
    def test_record_result_match_already_finished(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        match = Match.objects.get(tournament_id=tid, round_nb=1)
        self._record_result(tid, match.pk, self.p1.pk)  # first record
        resp = self._record_result(tid, match.pk, self.p2.pk)  # second attempt
        self.assertEqual(resp.status_code, 400)
        self.assertIn("already finished", resp.json()["error"])

    def test_record_result_missing_winner(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        match = Match.objects.get(tournament_id=tid, round_nb=1)
        self._auth(self.admin_token)
        resp = self.client.patch(
            f"/api/tournaments/{tid}/matches/{match.pk}/",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Winner is required", resp.json()["error"])

    def test_record_result_invalid_winner_not_player(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        match = Match.objects.get(tournament_id=tid, round_nb=1)
        # p3 is not in the match
        resp = self._record_result(tid, match.pk, self.p3.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("must be one of the match players", resp.json()["error"])

    def test_record_result_nonexistent_winner(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        match = Match.objects.get(tournament_id=tid, round_nb=1)
        resp = self._record_result(tid, match.pk, 99999)  # non-existent user
        self.assertEqual(resp.status_code, 400)
        self.assertIn("does not exist", resp.json()["error"])

    def test_record_result_match_not_in_tournament_404(self):
        # Create two tournaments, get a match from first, try to update with second tournament id
        tid1 = self._create_tournament("Cup1", max_players=2)
        self._join(self.p1_token, tid1)
        self._join(self.p2_token, tid1)
        self._start(tid1)

        tid2 = self._create_tournament("Cup2", max_players=2)
        self._join(self.p3_token, tid2)
        self._join(self.p4_token, tid2)
        self._start(tid2)

        match_from_t1 = Match.objects.filter(tournament_id=tid1, round_nb=1).first()
        # Try to record result using tid2 but match from tid1
        self._auth(self.admin_token)
        resp = self.client.patch(
            f"/api/tournaments/{tid2}/matches/{match_from_t1.pk}/",
            {"winner": self.p1.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)

    # ---------- Tournament state validation ----------
    def test_record_result_tournament_open_fails(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        # Not started, still OPEN
        match = Match.objects.create(
            tournament_id=tid,
            player1=self.p1,
            player2=self.p2,
            round_nb=1,
            status=MatchStatus.PENDING,
        )
        resp = self._record_result(tid, match.pk, self.p1.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not in progress", resp.json()["error"])

    def test_record_result_tournament_finished_fails(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)
        match = Match.objects.get(tournament_id=tid, round_nb=1)
        self._record_result(tid, match.pk, self.p1.pk)  # finishes tournament
        # Try to record another result
        resp = self._record_result(tid, match.pk, self.p2.pk)
        self.assertEqual(resp.status_code, 400)
        # The match is already finished, so that error fires first
        self.assertIn("already finished", resp.json()["error"])

    def test_record_result_tournament_cancelled_fails(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)
        match = Match.objects.get(tournament_id=tid, round_nb=1)
        Tournament.objects.filter(pk=tid).update(status=TournamentStatus.CANCELLED)
        resp = self._record_result(tid, match.pk, self.p1.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not in progress", resp.json()["error"])

    # ---------- Bye match edge case ----------
    def test_record_result_bye_match_already_finished(self):
        """A bye match (created automatically) cannot be updated."""
        tid = self._create_tournament(max_players=3)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._start(tid)

        bye_match = Match.objects.filter(
            tournament_id=tid, round_nb=1, player2=None
        ).first()
        self.assertIsNotNone(bye_match)
        self.assertEqual(bye_match.status, MatchStatus.FINISHED)

        resp = self._record_result(tid, bye_match.pk, self.p1.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("already finished", resp.json()["error"])

    # ---------- Bracket progression ----------
    def test_bracket_progression_creates_next_round(self):
        tid = self._create_tournament(max_players=4)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._join(self.p4_token, tid)
        self._start(tid)

        matches_r1 = list(Match.objects.filter(tournament_id=tid, round_nb=1).order_by("id"))
        self.assertEqual(len(matches_r1), 2)

        # Finish first match
        self._record_result(tid, matches_r1[0].pk, matches_r1[0].player1_id or matches_r1[0].player1.pk)
        # No new match yet (sibling not finished)
        self.assertEqual(Match.objects.filter(tournament_id=tid, round_nb=2).count(), 0)

        # Finish second match
        self._record_result(tid, matches_r1[1].pk, matches_r1[1].player1_id or matches_r1[1].player1.pk)
        # Now a round-2 match should exist
        self.assertEqual(Match.objects.filter(tournament_id=tid, round_nb=2).count(), 1)
        new_match = Match.objects.get(tournament_id=tid, round_nb=2)
        self.assertEqual(new_match.status, MatchStatus.PENDING)
        self.assertIsNotNone(new_match.player1)
        self.assertIsNotNone(new_match.player2)
        self.assertIsNone(new_match.winner)

    def test_bracket_progression_with_bye(self):
        tid = self._create_tournament(max_players=3)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._start(tid)

        matches_r1 = list(Match.objects.filter(tournament_id=tid, round_nb=1).order_by("id"))
        # Two matches: one regular, one bye (player2=None, FINISHED)
        bye_match = None
        regular_match = None
        for m in matches_r1:
            if m.player2 is None:
                bye_match = m
            else:
                regular_match = m
        self.assertIsNotNone(bye_match)
        self.assertIsNotNone(regular_match)
        self.assertEqual(bye_match.status, MatchStatus.FINISHED)

        # Finish the regular match
        self._record_result(tid, regular_match.pk, regular_match.player1_id or regular_match.player1.pk)
        # Now a round-2 match should exist (bye winner vs regular winner)
        self.assertEqual(Match.objects.filter(tournament_id=tid, round_nb=2).count(), 1)

    def test_final_match_finishes_tournament(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        match = Match.objects.get(tournament_id=tid, round_nb=1)
        self._record_result(tid, match.pk, self.p1.pk)

        # Tournament should be FINISHED
        tournament = Tournament.objects.get(pk=tid)
        self.assertEqual(tournament.status, TournamentStatus.FINISHED)
        # No extra match created
        self.assertEqual(Match.objects.filter(tournament_id=tid).count(), 1)

    def test_partial_results_keep_tournament_ongoing(self):
        """Tournament stays ONGOING when not all matches are finished."""
        tid = self._create_tournament(max_players=4)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._join(self.p4_token, tid)
        self._start(tid)

        matches_r1 = list(Match.objects.filter(tournament_id=tid, round_nb=1).order_by("id"))
        # Finish only the first match
        self._record_result(tid, matches_r1[0].pk, matches_r1[0].player1_id or matches_r1[0].player1.pk)
        tournament = Tournament.objects.get(pk=tid)
        self.assertEqual(tournament.status, TournamentStatus.ONGOING)

    def test_full_chain_4_player_tournament(self):
        """Walk through a complete 4‑player tournament end‑to‑end."""
        tid = self._create_tournament(max_players=4)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._join(self.p4_token, tid)
        self._start(tid)

        # Round 1 has 2 matches
        r1 = list(Match.objects.filter(tournament_id=tid, round_nb=1).order_by("id"))
        self.assertEqual(len(r1), 2)

        # Finish both round‑1 matches
        self._record_result(tid, r1[0].pk, r1[0].player1_id or r1[0].player1.pk)
        self._record_result(tid, r1[1].pk, r1[1].player1_id or r1[1].player1.pk)

        # Round 2 should have 1 match
        r2 = list(Match.objects.filter(tournament_id=tid, round_nb=2).order_by("id"))
        self.assertEqual(len(r2), 1)

        # Finish the final match
        self._record_result(tid, r2[0].pk, r2[0].player1_id or r2[0].player1.pk)

        # Tournament should be FINISHED
        tournament = Tournament.objects.get(pk=tid)
        self.assertEqual(tournament.status, TournamentStatus.FINISHED)

    # ---------- Duplicate prevention ----------
    def test_get_or_create_prevents_duplicate_next_round_match(self):
        """When both siblings finish, only one next‑round match is created."""
        tid = self._create_tournament(max_players=4)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._join(self.p3_token, tid)
        self._join(self.p4_token, tid)
        self._start(tid)

        matches = list(Match.objects.filter(tournament_id=tid, round_nb=1).order_by("id"))
        m1, m2 = matches[0], matches[1]

        # Finish both matches
        self._record_result(tid, m1.pk, m1.player1_id or m1.player1.pk)
        self._record_result(tid, m2.pk, m2.player1_id or m2.player1.pk)

        # Only one round‑2 match should exist
        r2_count = Match.objects.filter(tournament_id=tid, round_nb=2).count()
        self.assertEqual(r2_count, 1)

    # ---------- Authentication ----------
    def test_unauthenticated_cannot_record(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        match = Match.objects.get(tournament_id=tid, round_nb=1)
        self.client.credentials()  # remove auth
        resp = self.client.patch(
            f"/api/tournaments/{tid}/matches/{match.pk}/",
            {"winner": self.p1.pk},
            format="json",
        )
        self.assertIn(resp.status_code, [401, 403])

    def test_non_admin_cannot_record(self):
        tid = self._create_tournament(max_players=2)
        self._join(self.p1_token, tid)
        self._join(self.p2_token, tid)
        self._start(tid)

        match = Match.objects.get(tournament_id=tid, round_nb=1)
        # Use a regular user's token
        resp = self._record_result(tid, match.pk, self.p1.pk, token=self.p1_token)
        self.assertEqual(resp.status_code, 403)

