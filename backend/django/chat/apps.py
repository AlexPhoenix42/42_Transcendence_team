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

        # Reset all users to offline on startup
        # Active WebSocket connections will set them back online
        import threading
        threading.Timer(3.0, self._reset_online_status).start()

    @staticmethod
    def _reset_online_status():
        try:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            count = User.objects.filter(is_online=True).update(is_online=False)
            if count:
                import logging
                logging.getLogger(__name__).warning("Reset %d users to offline on startup", count)
        except Exception:
            import logging
            logging.getLogger(__name__).exception("Failed to reset online status")

