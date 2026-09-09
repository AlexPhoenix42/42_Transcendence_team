# tournament/signals.py

from django.db                      import transaction
from django.db.models.signals       import post_save
from django.dispatch                import receiver

from .models                        import Tournament, Match, MatchStatus
from .bracket                       import advance_winner, _building   # <-- new imports
from chat.models                    import ChatRoom, RoomType
from chess_game.models              import Game
from chat.utils                     import notify_tournament_room


# ── 1. Create a chat room when a tournament is created ──
@receiver(post_save, sender=Tournament)
def create_tournament_chat_room(sender, instance, created, **kwargs):
    if created:
        ChatRoom.objects.get_or_create(
            room_type=RoomType.TOURNAMENT,
            tournament_id=instance.pk,
        )


# ── 2. When a Game finishes, update the linked Match and let the Match signal handle advancement ──
@receiver(post_save, sender=Game)
def handle_game_finished(sender, instance, created, **kwargs):
    # Only act on existing games that just finished
    if created or instance.status != "FINISHED":
        return

    # Find the match linked to this game
    try:
        match = instance.match
    except Match.DoesNotExist:
        return   # Not a tournament game

    # Guard against duplicate signals
    if match.status != MatchStatus.IN_PROGRESS:
        return

    # Transfer the winner and finalise the match
    match.winner = instance.winner
    match.status = MatchStatus.FINISHED
    match.save(update_fields=["winner", "status", "updated_at"])

    # Notify tournament chat
    winner_name = instance.winner.username if instance.winner else "Unknown"
    loser = instance.player2 if instance.player1 == instance.winner else instance.player1
    loser_name = loser.username if loser else "Unknown"
    notify_tournament_room(
        match.tournament_id,
        f"⚔️ {winner_name} defeated {loser_name}!"
    )

@receiver(post_save, sender=Match)
def match_post_save(sender, instance, **kwargs):
    if _building:
        return
    with transaction.atomic():
        advance_winner(instance)

    # Check if tournament just finished
    if instance.status == MatchStatus.FINISHED and instance.winner:
        from .models import TournamentStatus as TS
        instance.tournament.refresh_from_db()
        if instance.tournament.status == TS.FINISHED:
            winner_name = instance.winner.username
            notify_tournament_room(
                instance.tournament_id,
                f"🏆 {winner_name} wins the tournament!"
            )
            notify_global_room(
                f"🏆 {winner_name} won the tournament \"{instance.tournament.name}\"!"
            )

        _auto_start_ai_matches(instance.tournament)

    # Auto-start AI vs AI matches that are now ready
    if instance.status == MatchStatus.FINISHED and instance.winner:
        _auto_start_ai_matches(instance.tournament)


def _auto_start_ai_matches(tournament):
    """Find pending matches where both players are AI and start them."""
    import threading
    import random
    import time as time_mod

    from chess_game.models import Game
    from django.core.cache import cache

    pending = Match.objects.filter(
        tournament=tournament,
        status=MatchStatus.PENDING,
        player1__isnull=False,
        player2__isnull=False,
    ).select_related("player1", "player2")

    for match in pending:
        p1_name = match.player1.username if match.player1 else ""
        p2_name = match.player2.username if match.player2 else ""

        if not (p1_name.startswith("stockfish_ai") and p2_name.startswith("stockfish_ai")):
            continue

        if match.game:
            continue

        # Create the game
        game = Game.objects.create(
            player1=match.player1,
            player2=match.player2,
            created_by=match.player1,
            status="IN_PROGRESS",
            timer=tournament.timer,
        )

        game.player1_color = random.choice([True, False])
        game.crnt_turn = game.player1 if game.player1_color else game.player2
        game.save(update_fields=["player1_color", "crnt_turn"])

        match.game = game
        match.status = MatchStatus.IN_PROGRESS
        match.save(update_fields=["game", "status", "updated_at"])

        white_player = game.player1 if game.player1_color else game.player2

        game_key = f"game:{game.pk}"
        state = {
            "fen": Game.INITIAL_FEN,
            "crnt_turn": white_player.pk,
            "check": False,
            "checkmate": False,
            "status": "IN_PROGRESS",
            "moves": [],
            "disconnected": {},
            "player1_id": game.player1_id,
            "player2_id": game.player2_id,
        }

        if tournament.timer:
            try:
                init_min, inc_sec = map(int, tournament.timer.split("+"))
                init_sec = init_min * 60
                state["clocks"] = {
                    str(game.player1_id): init_sec,
                    str(game.player2_id): init_sec,
                }
                state["last_tick"] = time_mod.time()
                state["timer"] = {"init": init_sec, "inc": inc_sec}
            except ValueError:
                pass

        cache.set(game_key, state, timeout=86400)

        active_games = cache.get("active_games", set())
        active_games.add(str(game.pk))
        cache.set("active_games", active_games, timeout=None)

        # Start auto-play in background
        from chess_game.ai_autoplay import run_ai_game
        threading.Thread(
            target=run_ai_game,
            args=(game.pk,),
            daemon=True,
        ).start()

