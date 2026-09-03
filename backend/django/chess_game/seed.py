# chess_game/seed.py
#
# Mirrors chat/seed.py's pattern (post_migrate signal, connected in apps.py):
# "Play vs AI" looks this user up by username and 400s with "AI user not found"
# if it's missing (views.py, consumers.py). Nothing previously created it --
# chess_game/apps.py had no ready() hook at all, unlike chat's ChatConfig -- so
# every fresh database needed a manual fix before AI games could be created.

from django.contrib.auth import get_user_model

AI_USERNAME = "stockfish_ai"


def create_ai_user(sender, **kwargs):
    User = get_user_model()
    if User.objects.filter(username=AI_USERNAME).exists():
        return

    user = User(
        username=AI_USERNAME,
        email="stockfish_ai@internal.invalid",
        is_active=True,
    )
    # No password should ever authenticate this account -- it exists only to
    # be a Game.player2 foreign key, never to log in.
    user.set_unusable_password()
    user.save()
