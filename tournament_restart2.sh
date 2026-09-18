#!/usr/bin/env bash

# Set how many AI players you want (default 5)
NUM_AI=${NUM_AI:-5}

docker exec trans_backend_django python manage.py shell -c "
from tournament.models import Tournament, Match, TournamentParticipant
from chess_game.models import Game
from django.contrib.auth import get_user_model
User = get_user_model()

# Clean up old tournament
match_game_ids = Match.objects.filter(tournament_id=1, game__isnull=False).values_list('game_id', flat=True)
Game.objects.filter(pk__in=match_game_ids).delete()
Match.objects.filter(tournament_id=1).delete()
TournamentParticipant.objects.filter(tournament_id=1).delete()
Tournament.objects.filter(pk=1).delete()

# Create fresh tournament with enough capacity
t = Tournament.objects.create(name='AI Championship', max_players=$((NUM_AI + 1)), created_by=User.objects.get(username='zuk'))

# Helper to get or create a user
def get_or_create_user(username):
    try:
        return User.objects.get(username=username)
    except User.DoesNotExist:
        return User.objects.create_user(username=username, email=f'{username}@local', password='dummypass')

# Add the human player
human = get_or_create_user('zuk')
TournamentParticipant.objects.create(tournament=t, player=human)

# Add AI players
for i in range(1, $NUM_AI + 1):
    ai_name = f'stockfish_ai_{i}'
    ai_user = get_or_create_user(ai_name)
    TournamentParticipant.objects.create(tournament=t, player=ai_user)
    print(f'Added {ai_name}')

print(f'Tournament {t.pk} created with {TournamentParticipant.objects.filter(tournament=t).count()} players')
"

