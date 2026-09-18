#!/usr/bin/env bash

docker exec trans_backend_django python manage.py shell -c "
from tournament.models import Tournament, Match, TournamentParticipant
from chess_game.models import Game

# Clean up old tournament
match_game_ids = Match.objects.filter(tournament_id=1, game__isnull=False).values_list('game_id', flat=True)
Game.objects.filter(pk__in=match_game_ids).delete()
Match.objects.filter(tournament_id=1).delete()
TournamentParticipant.objects.filter(tournament_id=1).delete()
Tournament.objects.filter(pk=1).delete()

# Create fresh tournament
from django.contrib.auth import get_user_model
User = get_user_model()

t = Tournament.objects.create(name='AI Championship', max_players=4, created_by=User.objects.get(username='zuk'))

# Add participants
for name in ['zuk', 'stockfish_ai_1', 'stockfish_ai_2', 'stockfish_ai_3']:
    user = User.objects.get(username=name)
    TournamentParticipant.objects.create(tournament=t, player=user)
    print(f'Added {name}')

print(f'Tournament {t.pk} created with {TournamentParticipant.objects.filter(tournament=t).count()} players')
"

