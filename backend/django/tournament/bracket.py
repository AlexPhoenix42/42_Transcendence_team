# tournament/bracket.py

from django.db      import transaction
from .models        import Match, MatchStatus, Tournament

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
            participants = list(tournament.participants.all())
            n = len(participants)
            if n < 2:
                return

            # Step 6 – Determine bracket size (next power of 2)
            total_slots = 2 ** math.ceil(math.log2(n))
            num_byes = total_slots - n

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

            # Step 8 – Build rounds iteratively
            # Each round halves the number of slots.
            round_nb = 1
            current_slots = slots

            while len(current_slots) > 1:
                next_slots = []

                # Step 8a – Pair adjacent slots to create matches
                for i in range(0, len(current_slots), 2):
                    p1 = current_slots[i]
                    p2 = current_slots[i+1] if i+1 < len(current_slots) else None

                    # Skip if both are None (should not happen with our distribution)
                    if p1 is None and p2 is None:
                        continue

                    # Create the match
                    match = Match.objects.create(
                        tournament=tournament,
                        round_nb=round_nb,
                        player1=p1,
                        player2=p2,
                        status=MatchStatus.PENDING,
                        game=None,
                    )

                    # Step 8b – Handle byes immediately
                    # A bye is a match with only one player → it's finished instantly.
                    if p1 is None or p2 is None:
                        winner = p1 if p1 is not None else p2
                        match.winner = winner
                        match.status = MatchStatus.FINISHED
                        match.save()      # signal skips because _building is True
                        next_slots.append(winner)   # winner advances to next round
                    else:
                        # Real match – winner unknown yet
                        next_slots.append(None)

                # Step 8c – Create placeholders for the next round
                # The number of placeholders is half the number of advancing players.
                if len(next_slots) > 1:
                    for _ in range(len(next_slots) // 2):
                        Match.objects.create(
                            tournament=tournament,
                            round_nb=round_nb + 1,
                            player1=None,
                            player2=None,
                            status=MatchStatus.PENDING,
                            game=None,
                        )

                # Step 8d – Advance to the next round
                round_nb += 1
                current_slots = next_slots

    finally:
        # Step 9 – Always clear the building flag, even if an error occurs
        _building = False

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
        tournament.status = Tournament.Status.FINISHED
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
        next_match.save()


















# BAD!!!
#def advanced_bracket(match: Match) -> None:
#    # 1. Current and next round numbers
#    curt_round  = match.round_nb
#    next_round  = curt_round + 1
#
#    # 2. All matches in this round, ordered by ID (bracket order)
#    round_matches   = list(
#        Match.objects.filter(
#            tournament=match.tournament,
#            round_nb=curt_round,
#        ).order_by("id")
#    )
#
#    # 3. Position of the finished match in the round
#    #idx   = round_matches.index(match)
#    idx = next(i for i, m in enumerate(round_matches) if m.pk == match.pk)
#
#    # 4. Pair and sibling indices (matches are paired 0-1, 2-3, ...)
#    pair_idx        = idx // 2
#    sibling_idx     = pair_idx * 2 + (1 - (idx % 2))
#
#    # 5. Decide what to do
#    if  sibling_idx < len(round_matches):
#        sibling = round_matches[sibling_idx]
#        if  sibling.status == MatchStatus.FINISHED:
#            winner1 = round_matches[pair_idx * 2].winner
#            winner2 = round_matches[pair_idx * 2 + 1].winner
#            Match.objects.get_or_create(
#                tournament=match.tournament,
#                player1=winner1,
#                player2=winner2,
#                round_nb=next_round,
#                defaults={"status": MatchStatus.PENDING},
#                #status=MatchStatus.PENDING,
#            )
#
#    # Only create a bye if this is not the final round
#    elif len(round_matches) > 1:
#        Match.objects.create(
#            tournament=match.tournament,
#            player1=match.winner,
#            player2=None,
#            winner=match.winner,
#            round_nb=next_round,
#            status=MatchStatus.FINISHED,
#        )



