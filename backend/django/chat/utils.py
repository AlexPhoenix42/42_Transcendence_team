# chat/utils.py

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model

from .models import ChatRoom, Message, RoomType

import logging
logger = logging.getLogger(__name__)

User = get_user_model()


def _get_system_user():
    """Get or create the system user for notifications."""
    user, _ = User.objects.get_or_create(
        username="system",
        defaults={"email": "system@local", "email_verfd": True},
    )
    return user


def send_system_message(room_id: int, content: str):
    """Save a system message and broadcast it to the chat room."""
    system_user = _get_system_user()

    msg = Message.objects.create(
        room_id=room_id,
        sender=system_user,
        content=content,
    )

    payload = {
        "id": msg.pk,
        "content": msg.content,
        "sender": "system",
        "send_role": "system",
        "created_at": msg.created_at.isoformat(),
    }

    channel_layer = get_channel_layer()
    if channel_layer:
        async_to_sync(channel_layer.group_send)(
            f"chat_room_{room_id}",
            {"type": "chat_message", "payload": payload},
        )


def notify_tournament_room(tournament_id: int, content: str):
    """Send a system message to a tournament's chat room."""
    try:
        room = ChatRoom.objects.get(room_type=RoomType.TOURNAMENT, tournament_id=tournament_id)
        send_system_message(room.pk, content)
    except ChatRoom.DoesNotExist:
        logger.warning("No chat room for tournament %s", tournament_id)


def notify_global_room(content: str):
    """Send a system message to the global chat room."""
    try:
        room = ChatRoom.objects.get(room_type=RoomType.GLOBAL)
        send_system_message(room.pk, content)
    except ChatRoom.DoesNotExist:
        logger.warning("No global chat room found")


def notify_game_room(game_id: int, content: str):
    """Send a system message to a game's chat room."""
    try:
        room = ChatRoom.objects.get(room_type=RoomType.GAME, game_id=game_id)
        send_system_message(room.pk, content)
    except ChatRoom.DoesNotExist:
        pass  # Game rooms are created on demand, might not exist yet

