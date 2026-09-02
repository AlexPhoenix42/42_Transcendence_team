# chat/consumers.py

from channels.generic.websocket     import AsyncWebsocketConsumer
from channels.db                    import database_sync_to_async

from django.core.cache              import cache

from chat.models                    import ChatRoom, RoomType, Message

import json

import logging

#from chat.signals import force_disconnect_on_logout

logger = logging.getLogger(__name__)

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # validate scope, logs and closes on failure, returns None
        result = await self._validate_scope()
        if  result is None:
            return

        user, room_id = result

        # Check membership
        has_access = await self._check_membership(user, room_id)
        if  not has_access:
            logger.warning(
                "User %s denied access to room %s",
                user.id,
                room_id,
            )
            await self.close(code=4003)
            return
        
        # Store for latter use
        self.user       = user
        self.room_id    = room_id

        # Join room group
        self.room_group_name = f"chat_room_{room_id}"
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name,
        )

        await self.accept()

        # Join a private user-group so we can force-disconnect on logout
        self.user_group_name = f"user_{self.user.pk}"

        #logger.info("User %s joined private group %s", self.user.pk, self.user_group_name)

        await self.channel_layer.group_add(
            self.user_group_name,
            self.channel_name,
        )

        await self._set_online(self.user)


    async def _validate_scope(self):
        """
        Production-grade scope validation.
        Returns (user, room_id) if the scope is valid.
        Closes the connection with a logged error otherwise.
        """
        # 1. User
        user = self.scope.get("user")
        if  user is None:
            logger.error("WebSocket scope missing 'user'.")
            await self.close(code=4001)
            return None

        if  user.is_anonymous:
            logger.error("Unauthenticated WebSocket connection.")
            await self.close(code=4001)
            return None

        # 2. URL route
        url_route   = self.scope.get("url_route")
        if  url_route is None:
            logger.error("WebSocket scope missing 'url_route'.")
            await self.close(code=4000)
            return None

        # 3. Room ID from kwargs
        kwargs      = url_route.get("kwargs")
        if  kwargs is None:
            logger.error("WebSocket socope missing 'url_route.kwargs'.")
            await self.close(code=4000)
            return None

        room_id     = kwargs.get("room_id")
        if  room_id is None:
            logger.error("websocket scope missing 'url_route.kwargs.room_id'.")
            await self.close(code=4000)
            return None

        return user, room_id


    @database_sync_to_async
    def _check_membership(self, user, room_id) -> bool:
        try:
            room    = ChatRoom.objects.get(id=room_id)
        except ChatRoom.DoesNotExist:
            return False

        if  room.room_type == RoomType.DM:
            return room.members.filter(id=user.pk).exists()

        if  room.room_type in (
            RoomType.GLOBAL,
            RoomType.TOURNAMENT,
            RoomType.GAME,
        ):
            return True

        return False

    @database_sync_to_async
    def _set_online(self, user):
        key = f"online_count:{user.pk}"
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout=None)
        user.is_online = True
        user.save(update_fields=["is_online"])

    @database_sync_to_async
    def _set_offline(self, user):
        key = f"online_count:{user.pk}"
        try:
            cnt = cache.decr(key)
        except ValueError:
            cnt = 0
        if cnt <= 0:
            cache.delete(key)
            user.is_online = False
            user.save(update_fields=["is_online"])


    async def receive(self, text_data=None, bytes_data=None):
        if  text_data is None:
            await self.send(text_data=json.dumps({"error": "Empty message."}))
            return

        # Parse JSON
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            logger.warning("Invalid Json received on WebSocket.")
            await self.send(text_data=json.dumps({"error": "Invalid JSON"}))
            return

        content = data.get("content", "").strip()
        if  not content or len(content) > 2000:
            await self.send(text_data=json.dumps({"error": "Message content must be 2000 max chars."}))
            return
        
        if  not await self._check_rate_limit(self.user.pk):
            await self.send(text_data=json.dumps({"error": "Rate limit exceeded. Please slow down."}))
            return 

        payload = await self._save_message(content)

        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "chat_message", "payload": payload},
        )


    @database_sync_to_async
    def _save_message(self, content: str):
        msg = Message.objects.create(
            room_id=self.room_id,
            sender=self.user,
            content=content,
        )

        return {
            "id"            : msg.pk,
            "content"       : msg.content,
            "sender"        : self.user.username,
            "created_at"    : msg.created_at.isoformat(),
        }

    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event["payload"]))


    async def disconnect(self, code: int) -> None:
        if  hasattr(self, "user"):
            await self._set_offline(self.user)

        # Leave room group
        if  hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name,
            )

        # Leave private user group
        if  hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(
                self.user_group_name,
                self.channel_name,
            )

    async def force_disconnect(self, event):
        #logger.info("force_disconnect received for user %s", self.scope.get("user"))

        # Leave room group
        if  hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name,
            )

        # Leave private user group
        if  hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(
                self.user_group_name,
                self.channel_name,
            )

        if hasattr(self, "user"):
            await self._set_offline(self.user)

        await self.close(code=4001)

    @database_sync_to_async
    def _check_rate_limit(self, user_id: int) -> bool:
        key = f"chat_rate:{user_id}"
        try:
            try:
                cnt = cache.incr(key)
            except ValueError:
                # Key didnt exist, create it automatically
                if  cache.add(key, 1, timeout=10):
                    cnt = 1
                else:
                    # Another request just created it, increment safely
                    cnt = cache.incr(key)
        except Exception:
            # Redis unreachable -> fail open
            #logger.exception("Rate limit check failed allowing message.")
            #return True
            # Redis unreachable -> fail closed: block msg
            logger.exception("Rate limit check failed blocking message.")
            return False

        if  cnt > 10:
            logger.warning("Rate limit exceeded for user %s.", user_id)
            return False

        return True

