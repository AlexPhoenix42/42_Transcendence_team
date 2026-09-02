# tournament/signals.py

from django.db                      import transaction
from django.db.models.signals       import post_save
from django.dispatch                import receiver

from .models                        import Tournament, Match, MatchStatus
from .bracket                       import advance_winner, _building   # <-- new imports
from chat.models                    import ChatRoom, RoomType
from chess_game.models              import Game


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

    # ── Advancement is now handled by the Match post_save signal ──
    # No need to call `advanced_bracket` anymore.
    # The Match signal will call `advance_winner` automatically.


# ── 3. New Match signal: advance the winner when a match finishes ──
@receiver(post_save, sender=Match)
def match_post_save(sender, instance, **kwargs):
    # Skip advancement during bracket building (prevents premature actions)
    if _building:
        return
    # Advance the winner to the next round
    with transaction.atomic():
        advance_winner(instance)




















































## tournament/signals.py
#
#from django.db.models.signals       import post_save
#from django.dispatch                import receiver
#
#from .models                        import (
#    Tournament, TournamentStatus, Match, MatchStatus
#)
#
#from .bracket                       import advanced_bracket
#
#from chat.models                    import ChatRoom, RoomType
#from game.models                    import Game
#
#
#@receiver(post_save, sender=Tournament)
#def create_tournament_chat_room(sender, instance, created, **kwargs):
#    if  created:
#        ChatRoom.objects.get_or_create(
#            room_type=RoomType.TOURNAMENT,
#            tournament_id=instance.pk,
#        )
#
#
#@receiver(post_save, sender=Game)
#def handle_game_finished(sender, instance, created, **kwargs):
#    """When a Game finishes, update the linked Match and advance the bracket."""
#    # Only act on existing games that just transitioned to FINISHED
#    if  created or instance.status != "FINISHED":
#        return
#
#
#    # Find the match linked to this game (via OneToOneField related_name="match")
#    try:
#        match = instance.match
#    except Match.DoesNotExist:
#        return # Not a tournament game, nothing ot do
#
#    
#    # Guard against duplicate signals, match still be in progress
#    if  match.status != MatchStatus.IN_PROGRESS:
#        return
#
#
#    # Transfer the winner and finalise the match
#    match.winner    = instance.winner
#    match.status    = MatchStatus.FINISHED
#    match.save(update_fields=["winner", "status", "updated_at"])
#
#    
#    # Advance the bracket
#    advanced_bracket(match)
#
#
#    # If no pending/in-progress matches remain, close the tournament
#    if  not Match.objects.filter(
#            tournament=match.tournament,
#            status__in=[MatchStatus.PENDING, MatchStatus.IN_PROGRESS],
#        ).exists():
#        tournament          = match.tournament
#        tournament.status   = TournamentStatus.FINISHED
#        tournament.save(update_fields=["status", "updated_at"])

