# chat/signals.py

import logging

from asgiref.sync                   import async_to_sync

from channels.layers                import get_channel_layer

from django.contrib.auth.signals    import user_logged_out

from django.dispatch                import receiver


logger = logging.getLogger(__name__)


@receiver(user_logged_out)
def force_disconnect_on_logout(sender, user, request, **kwargs):
    """Close all WebSocket connections for the logged-out user."""
    if  user is None or not user.is_authenticated:
        return # nothing to do

    channel_layer   = get_channel_layer()
    if  channel_layer is None:
        return

    group_name      = f"user_{user.pk}"

    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {"type": "force_disconnect", "reason": "logged_out"},
        )
        logger.info("SIGNAL FIRED: sending force_disconnect to group %s", group_name)
    except Exception:
        logger.exception("Failed to force disconnected user %s from chat", user.pk)

