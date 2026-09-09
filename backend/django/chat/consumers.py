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


    async def game_started(self, event):
        await self.send(text_data=json.dumps({
            "type": "game_started",
            "game_id": event["game_id"],
        }))


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

        # Handle typing indicator
        if  data.get("type") == "typing":
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "typing_indicator",
                    "sender": self.user.username,
                },
            )
            return

        # Check if user is muted
        is_muted = await self._check_muted()
        if is_muted:
            await self.send(text_data=json.dumps({"error": "You are muted in this room."}))
            return

        # Handle game invite
        if  data.get("type") == "game_invite":
            await self._handle_game_invite()
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


    async def _handle_game_invite(self):
        """Send a game invite to the DM room."""
        from django.core.cache import cache
        import uuid

        room = await database_sync_to_async(
            lambda: ChatRoom.objects.get(pk=self.room_id)
        )()

        if room.room_type != RoomType.DM:
            await self.send(text_data=json.dumps({"error": "Invites only in DMs"}))
            return

        invite_id = str(uuid.uuid4())
        cache.set(f"game_invite:{invite_id}", {
            "from_user_id": self.user.pk,
            "from_username": self.user.username,
            "room_id": self.room_id,
        }, timeout=300)

        # Save as a system message so it persists
        from chat.utils import send_system_message
        await database_sync_to_async(send_system_message)(
            self.room_id,
            f"GAME_INVITE:{invite_id}:{self.user.username}"
        )


    async def game_invite_message(self, event):
        await self.send(text_data=json.dumps({
            "type": "game_invite",
            "invite_id": event["invite_id"],
            "from_username": event["from_username"],
        }))


    @database_sync_to_async
    def _check_muted(self) -> bool:
        from chat.models import MutedUser
        from django.utils import timezone

        # Check room-specific mute
        muted = MutedUser.objects.filter(
            user=self.user,
            room_id=self.room_id,
            expires_at__gt=timezone.now(),
        ).exists()

        if muted:
            return True

        # Check global mute (room=None)
        return MutedUser.objects.filter(
            user=self.user,
            room__isnull=True,
            expires_at__gt=timezone.now(),
        ).exists()


    async def message_deleted(self, event):
        await self.send(text_data=json.dumps({
            "type": "message_deleted",
            "message_id": event["message_id"],
        }))


    async def typing_indicator(self, event):
        # Don't send typing indicator back to the sender
        if  event["sender"] == self.user.username:
            return

        await self.send(text_data=json.dumps({
            "type": "typing",
            "sender": event["sender"],
        }))


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
            "sender_role"   : self.user.role,
            "created_at"    : msg.created_at.isoformat(),
        }


    #async def chat_message(self, event):
    #    await self.send(text_data=json.dumps(event["payload"]))
    async def chat_message(self, event):
        # Check if current user has blocked the sender
        sender_username = event["payload"].get("sender")
        if sender_username and sender_username != "system":
            is_blocked = await self._is_blocked(sender_username)
            if is_blocked:
                return  # Don't deliver to this user

        await self.send(text_data=json.dumps(event["payload"]))

    async def read_receipt(self, event):
        # Don't send back to the reader
        if event["username"] == self.user.username:
            return

        await self.send(text_data=json.dumps({
            "type": "read_receipt",
            "username": event["username"],
            "read_at": event["read_at"],
        }))

    @database_sync_to_async
    def _is_blocked(self, sender_username) -> bool:
        from chat.models import BlockedUser
        from django.contrib.auth import get_user_model
        User = get_user_model()

        try:
            sender = User.objects.get(username=sender_username)
        except User.DoesNotExist:
            return False

        return BlockedUser.objects.filter(
            blocker=self.user,
            blocked=sender,
        ).exists()


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

        if  cnt > 5:
            logger.warning("Rate limit exceeded for user %s.", user_id)
            print(f"RATE LIMIT HIT for user {user_id}", flush=True)

            # Track consecutive rate limit hits for auto-mute
            spam_key = f"chat_spam:{user_id}"
            try:
                try:
                    spam_cnt = cache.incr(spam_key)
                except ValueError:
                    cache.set(spam_key, 1, timeout=300)  # 5 min window
                    spam_cnt = 1

                print(f"SPAM COUNT for user {user_id}: {spam_cnt}", flush=True)

                if spam_cnt >= 3:  # 3 rate limit hits = auto-mute
                    from chat.models import MutedUser, ChatRoom, RoomType
                    from django.utils import timezone
                    from datetime import timedelta
                    from django.contrib.auth import get_user_model
                    User = get_user_model()

                    user = User.objects.get(pk=user_id)
                    if user.role not in ("admin", "moderator"):  # type: ignore[union-attr]
                        MutedUser.objects.update_or_create(
                            user=user,
                            room=None,  # global mute
                            defaults={
                                "muted_by": user,
                                "reason": "Auto-muted for spamming",
                                "expires_at": timezone.now() + timedelta(minutes=60),
                            },
                        )
                        cache.delete(spam_key)
                        logger.warning("Auto-muted user %s for spamming.", user_id)

                        from chat.utils import send_system_message
                        global_room = ChatRoom.objects.filter(room_type=RoomType.GLOBAL).first()
                        if global_room:
                            send_system_message(
                                global_room.pk,
                                f"🔇 {user.username} auto-muted for 60 minutes (spamming)."  # type: ignore[union-attr]
                            )
            except Exception:
                logger.exception("Spam tracking failed for user %s", user_id)

            return False

        return True

