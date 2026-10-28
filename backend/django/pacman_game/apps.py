# pacman_game/apps.py

from django.apps import AppConfig


class PacmanGameConfig(AppConfig):
    name = 'pacman_game'

    def ready(self):
        # Précharge le module de lock Redis (utilisé par `_room_lock` dans
        # consumers.py) une fois, séquentiellement, au démarrage. Sans ça, la
        # toute première salve de connexions concurrentes après un
        # (re)démarrage peut faire importer `redis.lock`/`redis.exceptions`
        # par plusieurs threads en même temps -> le détecteur d'interblocage
        # de l'import Python lève `_DeadlockError` pour l'une d'elles (observé
        # une fois lors d'un test de charge, juste après un restart).
        import redis.lock       # noqa: F401
        import redis.exceptions  # noqa: F401
