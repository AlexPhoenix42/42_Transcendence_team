# chess_game/stats.py

from django.db.models import F


def _elo_change(winner_rating: int, loser_rating: int, k: int = 32) -> int:
    """Calculate ELO rating change. Returns points gained by winner."""
    expected = 1 / (1 + 10 ** ((loser_rating - winner_rating) / 400))
    return max(1, round(k * (1 - expected)))


def update_player_stats(game):
    """Update wins/loss/draw/rating for both players after a game finishes.
    Skip practice games."""
    from django.core.cache import cache

    # Skip practice games
    state = cache.get(f"game:{game.pk}")
    if state and state.get("is_practice"):
        return

    # Skip if no players
    if not game.player1 or not game.player2:
        return

    p1 = game.player1
    p2 = game.player2

    # Refresh to get current ratings
    p1.refresh_from_db()
    p2.refresh_from_db()

    if game.winner is None:
        # Draw
        type(p1).objects.filter(pk=p1.pk).update(
            draw=F("draw") + 1,
        )
        type(p2).objects.filter(pk=p2.pk).update(
            draw=F("draw") + 1,
        )
    elif game.winner_id == p1.pk:
        change = _elo_change(p1.rating, p2.rating)
        type(p1).objects.filter(pk=p1.pk).update(
            wins=F("wins") + 1,
            rating=F("rating") + change,
        )
        type(p2).objects.filter(pk=p2.pk).update(
            loss=F("loss") + 1,
            rating=F("rating") - change,
        )
    elif game.winner_id == p2.pk:
        change = _elo_change(p2.rating, p1.rating)
        type(p2).objects.filter(pk=p2.pk).update(
            wins=F("wins") + 1,
            rating=F("rating") + change,
        )
        type(p1).objects.filter(pk=p1.pk).update(
            loss=F("loss") + 1,
            rating=F("rating") - change,
        )

