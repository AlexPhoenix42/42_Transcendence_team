# chess_game/apps.py

from django.apps import AppConfig


class GameConfig(AppConfig):
    name = 'chess_game'

    def ready(self):
        from django.db.models.signals import post_migrate
        from .seed import create_ai_user
        post_migrate.connect(create_ai_user, sender=self)

