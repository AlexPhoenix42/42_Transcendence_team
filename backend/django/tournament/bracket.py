# tournament/bracket.py

from django.db      import transaction
from .models        import Match, MatchStatus, Tournament, TournamentStatus

import math
import logging
logger = logging.getLogger(__name__)

# ── Flag to prevent `post_save` signals from firing during bracket building ──
# Without this, bye matches would trigger `advance_winner` before all matches exist.
_building = False

# ── Build the entire bracket for a tournament ──────────────────────────────
def build_bracket(tournament):
    global _building

    # Step 1 – Guard against accidental data loss
    # If matches with games already exist, raising an error prevents overwriting history.
    if Match.objects.filter(tournament=tournament, game__isnull=False).exists():
        raise ValueError("Cannot rebuild bracket: matches with games already exist.")

    # Step 2 – Clean up old matches that have no games
    # This lets you rebuild a bracket before any game is played.
    Match.objects.filter(tournament=tournament, game__isnull=True).delete()

    # Step 3 – Set the building flag to suppress signals
    _building = True
    try:
        # Step 4 – Wrap everything in a transaction for atomicity
        # If anything fails, no partial bracket is left in the database.
        with transaction.atomic():

            # Step 5 – Get participants and handle edge case
            participants = [p.player for p in tournament.participants.select_related("player").all()]
            n = len(participants)
            if n < 2:
                return

                    # Step 6 – Determine bracket size (next power of 2)
            total_slots = 2 ** math.ceil(math.log2(n))
            num_byes = total_slots - n
            num_rounds = int(math.log2(total_slots))

            # Step 7 – Distribute byes so no match has two byes
            # Byes are placed at even indices: 0, 2, 4, ...
            # Participants fill the remaining slots in order.
            slots = [None] * total_slots
            bye_positions = set(range(0, num_byes * 2, 2))

            p_idx = 0
            for i in range(total_slots):
                if i not in bye_positions and p_idx < n:
                    slots[i] = participants[p_idx]
                    p_idx += 1

            # Step 8 – Create ALL matches for ALL rounds upfront (empty)
            # This ensures advance_winner can always find the next-round match.
            matches_by_round: dict[int, list[Match]] = {}
            for r in range(1, num_rounds + 1):
                num_matches = total_slots // (2 ** r)
                round_matches = []
                for _ in range(num_matches):
                    m = Match.objects.create(
                        tournament=tournament,
                        round_nb=r,
                        player1=None,
                        player2=None,
                        status=MatchStatus.PENDING,
                        game=None,
                    )
                    round_matches.append(m)
                matches_by_round[r] = round_matches

            # Step 9 – Fill round 1 matches from seeded slots
            for i, match in enumerate(matches_by_round[1]):
                p1 = slots[i * 2]
                p2 = slots[i * 2 + 1] if (i * 2 + 1) < len(slots) else None
                match.player1 = p1
                match.player2 = p2

                # Step 9a – Handle byes immediately
                # A bye is a match with only one player → finished instantly.
                if p1 is None and p2 is None:
                    # Both empty – should not happen with proper distribution
                    match.save()
                elif p1 is None or p2 is None:
                    winner = p1 if p1 is not None else p2
                    match.winner = winner
                    match.status = MatchStatus.FINISHED
                    match.save()  # signal skips because _building is True
                    # Step 9b – Place bye winner into the next round match
                    _place_winner_in_next_round(matches_by_round, 1, i, winner)
                else:
                    # Real match – winner unknown yet
                    match.save()

    finally:
        # Step 10 – Always clear the building flag, even if an error occurs
        _building = False

# ── Place a bye winner into the next round's match ─────────────────────────
def _place_winner_in_next_round(matches_by_round, current_round, match_index, winner):
    """During bracket building, place a bye winner into the next round."""
    next_round = current_round + 1
    if next_round not in matches_by_round:
        return

    next_match_index = match_index // 2
    next_matches = matches_by_round[next_round]

    if next_match_index >= len(next_matches):
        return

    next_match = next_matches[next_match_index]
    if next_match.player1 is None:
        next_match.player1 = winner
    elif next_match.player2 is None:
        next_match.player2 = winner
    else:
        logger.warning("Both slots filled in match %s during bracket build", next_match.pk)
        return

    next_match.save()


# ── Advance a winner to the next round ─────────────────────────────────────
def advance_winner(match):
    # Step 1 – Only process finished matches with a winner
    if match.status != MatchStatus.FINISHED or not match.winner:
        return

    tournament = match.tournament
    current_round = match.round_nb
    next_round = current_round + 1

    # Step 2 – Find the index of this match in its round
    # Matches are ordered by `id`, which is the bracket order.
    round_matches = list(Match.objects.filter(tournament=tournament, round_nb=current_round).order_by('id'))
    try:
        idx = next(i for i, m in enumerate(round_matches) if m.pk == match.pk)
    except StopIteration:
        return  # should not happen

    # Step 3 – Map current index to the next round's match index
    # In a single‑elimination bracket, the winner of match `idx`
    # goes to match `idx // 2` in the next round.
    next_match_index = idx // 2
    next_round_matches = list(Match.objects.filter(tournament=tournament, round_nb=next_round).order_by('id'))

    # Step 4 – If no next round exists, this was the final match
    # Mark the tournament as FINISHED.
    if not next_round_matches:
        tournament.status = TournamentStatus.FINISHED
        tournament.save()
        return

    # Safety check – should never happen if bracket is correct
    if next_match_index >= len(next_round_matches):
        return

    next_match      = next_round_matches[next_match_index]
    next_match_pk   = next_match.pk

    # Step 5 – Fill the winner into the first empty slot of the next match
    with transaction.atomic():
        # lock the row and referesh from DB
        locked_match = Match.objects.select_for_update().get(pk=next_match_pk)
        if locked_match.player1 is None:
            locked_match.player1 = match.winner
        elif locked_match.player2 is None:
            locked_match.player2 = match.winner
        else:
            # Both slots already filled – shouldn't happen; log a warning.
            logger.warning("Both slots already filled in match %s", next_match.pk)
            return

        # Step 6 – Save the updated match
        locked_match.save()

