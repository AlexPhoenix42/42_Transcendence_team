# chat/seed.py

from .models import ChatRoom, RoomType

def create_global_room(sender, **kwargs):
    ChatRoom.objects.get_or_create(room_type=RoomType.GLOBAL)

