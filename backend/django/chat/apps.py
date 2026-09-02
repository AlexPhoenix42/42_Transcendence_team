# chat/apps.py

from django.apps                import AppConfig


class ChatConfig(AppConfig):
    default_auto_field  = "django.db.models.BigAutoField"
    name                = "chat"

    def ready(self):
        from django.db.models.signals   import post_migrate
        from .seed                      import create_global_room
        post_migrate.connect(create_global_room, sender=self)

        # Activate signal handler for logout -> force disconnect
        from . import signals # noqa: F401

