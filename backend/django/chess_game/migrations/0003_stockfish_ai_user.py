# chess_game/migrations/0003_stockfish_ai_user.py
#
# Create the "stockfish_ai" account that AI games are played against.
#
# chess_game/views.py looks this account up by username and, when it is
# missing, returns:
#
#     {"error": "AI user not found. Run migrations."}
#
# That message promised a migration that did not exist. The account had only
# ever been created by hand on a developer machine, so it lived in that one
# database and vanished the moment the database was recreated -- and a fresh
# clone of this repo could never start an AI game at all.
#
# This migration makes the message true. It is idempotent: it does nothing if
# the account is already there, so it is safe on databases that already have
# the hand-made one.

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import migrations

AI_USERNAME = "stockfish_ai"
AI_EMAIL    = "stockfish_ai@localhost"
AI_DISPNAME = "Stockfish AI"


def create_ai_user(apps, schema_editor):
    User = apps.get_model(settings.AUTH_USER_MODEL.split(".")[0], "User")

    if User.objects.filter(username=AI_USERNAME).exists():
        return

    fields = {
        # make_password(None) produces an unusable hash, so this account can
        # never be logged into. It exists only to sit on the other side of a
        # Game row.
        "password":     make_password(None),
        "is_active":    True,
        "is_staff":     False,
        "is_superuser": False,
    }

    # The user model has grown over time and this migration has to keep
    # working against the historical model, so only set what actually exists.
    names = {f.name for f in User._meta.get_fields()}
    if "email"       in names: fields["email"]       = AI_EMAIL
    if "dispname"    in names: fields["dispname"]    = AI_DISPNAME
    if "email_verfd" in names: fields["email_verfd"] = True
    if "is_online"   in names: fields["is_online"]   = False
    if "bio"         in names: fields["bio"]         = "Stockfish engine. Not a human."

    User.objects.create(username=AI_USERNAME, **fields)


def delete_ai_user(apps, schema_editor):
    # Only remove the account if nothing references it, so rolling this
    # migration back can never cascade into somebody's game history.
    User = apps.get_model(settings.AUTH_USER_MODEL.split(".")[0], "User")
    Game = apps.get_model("chess_game", "Game")

    ai = User.objects.filter(username=AI_USERNAME).first()
    if ai is None:
        return

    in_use = (
        Game.objects.filter(player1=ai).exists()
        or Game.objects.filter(player2=ai).exists()
    )
    if not in_use:
        ai.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("chess_game", "0002_initial"),
        ("users",      "0002_user_role"),
    ]

    operations = [
        migrations.RunPython(create_ai_user, delete_ai_user),
    ]
