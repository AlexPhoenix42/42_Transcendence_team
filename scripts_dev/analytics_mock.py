"""
Seed script: creates fake finished chess games for analytics demo.
Run from Django shell:  python manage.py shell < seed_games.py
Or:                     cat seed_games.py | python manage.py shell
"""

import random
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model
from chess_game.models import Game, GameStatus

User = get_user_model()

# ── CONFIG ──────────────────────────────────────────────────────────
TARGET_USER = "zuk"           # the user who will have game history
NUM_GAMES   = 40              # total games to create
AI_RATIO    = 0.3             # 30% of games are vs AI
WIN_RATIO   = 0.55            # 55% wins (realistic-ish)
DRAW_RATIO  = 0.10            # 10% draws
DAYS_SPAN   = 30              # spread games over last N days
# ────────────────────────────────────────────────────────────────────

user = User.objects.get(username=TARGET_USER)

# Get or create a dummy AI opponent
ai_user, _ = User.objects.get_or_create(
    username="stockfish_ai_seed",
    defaults={"email": "ai@seed.local", "rating": 1500},
)

# Get some human opponents (or create dummies)
human_opponents = list(
    User.objects.exclude(pk=user.pk)
    .exclude(username__startswith="stockfish_ai")
    [:5]
)

if not human_opponents:
    for i in range(3):
        opp, _ = User.objects.get_or_create(
            username=f"demo_player_{i+1}",
            defaults={"email": f"demo{i+1}@seed.local", "rating": 1200},
        )
        human_opponents.append(opp)

now = timezone.now()
created = 0

for i in range(NUM_GAMES):
    # Spread over DAYS_SPAN days, oldest first
    game_date = now - timedelta(
        days=DAYS_SPAN - int(i * DAYS_SPAN / NUM_GAMES),
        hours=random.randint(0, 12),
        minutes=random.randint(0, 59),
    )

    # Pick opponent
    is_ai = random.random() < AI_RATIO
    if is_ai:
        opponent = ai_user
    else:
        opponent = random.choice(human_opponents)

    # Decide result
    roll = random.random()
    if roll < WIN_RATIO:
        result = "win"
    elif roll < WIN_RATIO + DRAW_RATIO:
        result = "draw"
    else:
        result = "loss"

    # Randomly assign colors
    user_is_white = random.random() < 0.5

    if user_is_white:
        p1, p2 = user, opponent
        p1_color = True
    else:
        p1, p2 = opponent, user
        p1_color = True  # p1 is always white in this setup

    # Determine winner
    if result == "win":
        winner = user
    elif result == "loss":
        winner = opponent
    else:
        winner = None

    # Generate fake moves (random length 15-80)
    num_moves = random.randint(15, 80)
    fake_moves = [f"e{random.randint(1,8)}" for _ in range(num_moves)]

    game = Game(
        player1=p1,
        player2=p2,
        player1_color=p1_color,
        player2_is_ai=is_ai,
        status=GameStatus.FINISHED,
        winner=winner,
        result_reason=random.choice(["checkmate", "resignation", "timeout"]) if winner else "draw",
        moves=fake_moves,
    )
    game.save()

    # Override the auto timestamps
    Game.objects.filter(pk=game.pk).update(
        created_at=game_date,
        updated_at=game_date + timedelta(minutes=random.randint(5, 45)),
    )

    created += 1

print(f"\n✅ Created {created} games for user '{TARGET_USER}'")
print(f"   Spread over the last {DAYS_SPAN} days")
print(f"   Win/loss/draw ratio: ~{WIN_RATIO*100:.0f}% / {(1-WIN_RATIO-DRAW_RATIO)*100:.0f}% / {DRAW_RATIO*100:.0f}%")
print(f"   AI games: ~{AI_RATIO*100:.0f}%")
print(f"\n   Refresh your Analytics page to see the charts!")

