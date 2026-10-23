# chat/views.py

from rest_framework.views           import APIView
from rest_framework.response        import Response

from rest_framework                 import generics
from rest_framework.permissions     import IsAuthenticated
from rest_framework.authentication  import SessionAuthentication

from users.permissions              import IsModeratorOrAdmin

from rest_framework_simplejwt.authentication import JWTAuthentication

from rest_framework.pagination      import PageNumberPagination

from django.utils                   import timezone

from .serializers                   import MessageSerializer

from .models                        import (
    Message, ChatRoom, RoomType, BlockedUser, MessageReadStatus, MutedUser
)

# =========================================================================
class MessagePagination(PageNumberPagination):
    page_size               = 50
    page_size_query_param   = "page_size"
    max_page_size           = 100
# =========================================================================


# =========================================================================
class MessageListView(generics.ListAPIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication]

    serializer_class        = MessageSerializer
    pagination_class        = None
    #pagination_class        = MessagePagination

    def get_queryset(self):
        room_id     = self.kwargs["room_id"]
        user        = self.request.user

        room        = generics.get_object_or_404(ChatRoom, id=room_id)

        if  room.room_type == RoomType.DM:
            if  not room.members.filter(id=user.pk).exists():
                self.permission_denied(self.request)

        qs = Message.objects.filter(room=room).select_related("sender").order_by("created_at")

        limit = 100 if room.room_type == RoomType.GLOBAL else 200
        cnt = qs.count()
        if  cnt > limit:
            cutoff_id = qs.values_list("pk", flat=True)[cnt - limit]
            qs = qs.filter(pk__gte=cutoff_id)

        return qs
# =========================================================================


# =========================================================================
class RoomResolveView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]


    def get(self, request):
        room, _ = ChatRoom.objects.get_or_create(room_type=RoomType.GLOBAL)
        return Response({"room_id": room.pk})
# =========================================================================


# =========================================================================
class RoomTournamentResolveView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get(self, request, tournament_id):
        room, _ = ChatRoom.objects.get_or_create(
            room_type=RoomType.TOURNAMENT,
            tournament_id=tournament_id,
        )

        return Response({"room_id": room.pk})
# =========================================================================


# =========================================================================
class RoomDMResolveView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request, user_id):
        if  request.user.pk == user_id:
            return Response(
                {"error": "Cannot create DM with yourself."},
                status=400,
            )

        from  django.contrib.auth import get_user_model
        User = get_user_model()

        if  not User.objects.filter(pk=user_id).exists():
            return Response(
                {"error": "User not found."},
                status=400,
            )

        # Check if either user has blocked the other
        if  BlockedUser.objects.filter(
            blocker=request.user, blocked_id=user_id
        ).exists():
            return Response(
                {"error": "You have blocked this user."},
                status=400,
            )

        if  BlockedUser.objects.filter(
            blocker_id=user_id, blocked=request.user
        ).exists():
            return Response(
                {"error": "This user has blocked you."},
                status=403,
            )

        room = ChatRoom.objects.get_or_create_dm(request.user.pk, user_id)  # type: ignore[attr-defined]

        return Response({"room_id": room.pk})
# =========================================================================


# =========================================================================
class RoomGameResolveView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get(self, request, game_id):
        room, _ = ChatRoom.objects.get_or_create(
            room_type=RoomType.GAME,
            game_id=game_id,
        )

        return Response({"room_id": room.pk})
# =========================================================================


# =========================================================================
class BlockUserView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request, user_id):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        if  request.user.pk == user_id:
            return Response({"error": "Cannot block yourself."}, status=400)

        if  not User.objects.filter(pk=user_id).exists():
            return Response({"error": "User not found."}, status=404)

        _, created = BlockedUser.objects.get_or_create(
            blocker=request.user,
            blocked_id=user_id,
        )

        if  not created:
            return Response({"error": "User already blocked."}, status=400)

        # Remove friendship if exists
        request.user.friends.remove(User.objects.get(pk=user_id))

        # Cancel pending friend requests in both directions
        from friends.models import FriendRequest
        FriendRequest.objects.filter(
            from_user=request.user, to_user_id=user_id, status="pending"
        ).update(status="cancelled")
        FriendRequest.objects.filter(
            from_user_id=user_id, to_user=request.user, status="pending"
        ).update(status="cancelled")

        return Response({"status": "blocked"}, status=201)
# =========================================================================


# =========================================================================
class UnblockUserView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def delete(self, request, user_id):
        deleted, _ = BlockedUser.objects.filter(
            blocker=request.user,
            blocked_id=user_id,
        ).delete()

        if  not deleted:
            return Response({"error": "User not blocked."}, status=400)

        return Response(status=204)
# =========================================================================


# =========================================================================
class BlockedListView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get(self, request):
        blocked = BlockedUser.objects.filter(
            blocker=request.user
        ).select_related("blocked")

        data = [
            {
                "id": b.blocked.pk,
                "username": b.blocked.username,
                "blocked_at": b.created_at.isoformat(),
            }
            for b in blocked
        ]

        return Response(data)
# =========================================================================


# =========================================================================
class MarkReadView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request, room_id):
        room = generics.get_object_or_404(ChatRoom, id=room_id)

        MessageReadStatus.objects.update_or_create(
            user=request.user,
            room=room,
            defaults={"last_read_at": timezone.now()},
        )

        # Broadcast read status to room
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"chat_room_{room_id}",
                {
                    "type": "read_receipt",
                    "username": request.user.username,
                    "read_at": timezone.now().isoformat(),
                },
            )

        return Response({"status": "read"})
# =========================================================================


# =========================================================================
class UnreadCountsView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get(self, request):

        user = request.user

        # Get all rooms the user has access to
        # Global rooms + DMs they're members of + tournament/game rooms they've messaged in
        dm_rooms = ChatRoom.objects.filter(
            room_type=RoomType.DM,
            members=user,
        )
        global_rooms = ChatRoom.objects.filter(room_type=RoomType.GLOBAL)
        messaged_rooms = ChatRoom.objects.filter(
            messages__sender=user,
        ).exclude(room_type=RoomType.DM).exclude(room_type=RoomType.GLOBAL)

        all_rooms = (dm_rooms | global_rooms | messaged_rooms).distinct()

        result = []
        for room in all_rooms:
            read_status = MessageReadStatus.objects.filter(
                user=user, room=room
            ).first()

            if read_status:
                unread = Message.objects.filter(
                    room=room,
                    created_at__gt=read_status.last_read_at,
                ).exclude(sender=user).count()
            else:
                unread = Message.objects.filter(
                    room=room,
                ).exclude(sender=user).count()

            if unread > 0:
                entry = {
                    "room_id": room.pk,
                    "room_type": room.room_type,
                    "unread": unread,
                }
                # For DMs, include the other user's ID
                if  room.room_type == RoomType.DM:
                    other_member = room.members.exclude(pk=user.pk).first()
                    if  other_member:
                        entry["user_id"] = other_member.pk
                result.append(entry)

        return Response(result)
# =========================================================================


# =========================================================================
class RoomReadStatusView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get(self, request, room_id):
        room = generics.get_object_or_404(ChatRoom, id=room_id)

        if  room.room_type == RoomType.DM:
            # Only return the other DM member's read status
            other_member = room.members.exclude(pk=request.user.pk).first()
            if  not other_member:
                return Response([])

            status = MessageReadStatus.objects.filter(
                room=room, user=other_member
            ).first()

            if  status:
                return Response([{
                    "username": other_member.username,
                    "last_read_at": status.last_read_at.isoformat(),
                }])
            return Response([])

        # For non-DM rooms, return all (not typically used)
        statuses = MessageReadStatus.objects.filter(
            room=room
        ).exclude(user=request.user).select_related("user")

        data = [
            {
                "username": s.user.username,
                "last_read_at": s.last_read_at.isoformat(),
            }
            for s in statuses
        ]

        return Response(data)
# =========================================================================


# =========================================================================
class DeleteMessageView(APIView):
    permission_classes      = [IsModeratorOrAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def delete(self, request, message_id):
        from django.shortcuts import get_object_or_404

        msg = get_object_or_404(Message, pk=message_id)

        # Moderators can't delete admin or other moderator messages
        if request.user.role == "moderator" and msg.sender.role in ("admin", "moderator"):  # type: ignore[union-attr]
            return Response({"error": "Cannot delete staff messages."}, status=403)

        # Broadcast deletion to room
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"chat_room_{msg.room_id}",     # type: ignore[attr-defined]
                {
                    "type": "message_deleted",
                    "message_id": msg.pk,
                },
            )

        msg.delete()

        return Response({"status": "deleted"}, status=200)
# =========================================================================


# =========================================================================
class MuteUserView(APIView):
    permission_classes      = [IsModeratorOrAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request):
        from django.utils import timezone
        from datetime import timedelta
        from django.shortcuts import get_object_or_404
        from django.contrib.auth import get_user_model
        User = get_user_model()

        user_id = request.data.get("user_id")
        duration = request.data.get("duration", 10)  # minutes
        reason = request.data.get("reason", "")
        room_id = request.data.get("room_id")  # optional, None = global mute

        if not user_id:
            return Response({"error": "user_id required"}, status=400)

        target = get_object_or_404(User, pk=user_id)

        if target.role in ("admin", "moderator"):       # type: ignore[union-attr]
            return Response({"error": "Cannot mute staff members."}, status=403)

        try:
            duration = int(duration)
            if duration < 1 or duration > 1440:
                return Response({"error": "Duration must be 1-1440 minutes."}, status=400)
        except (TypeError, ValueError):
            return Response({"error": "Invalid duration."}, status=400)

        expires = timezone.now() + timedelta(minutes=duration)

        _mute, _created = MutedUser.objects.update_or_create(
            user=target,
            room_id=room_id,
            defaults={
                "muted_by": request.user,
                "reason": reason,
                "expires_at": expires,
            },
        )

        # Notify the room
        from chat.utils import send_system_message
        global_room = ChatRoom.objects.filter(room_type=RoomType.GLOBAL).first()
        target_room: int | None = room_id or (global_room.pk if global_room else None)
        if target_room:
            send_system_message(
                target_room,
                f"🔇 {target.username} has been muted for {duration} minutes."  # type: ignore[union-attr]
            )

        return Response({
            "status": "muted",
            "username": target.username,        # type: ignore[union-attr]
            "expires_at": expires.isoformat(),
        }, status=201)
# =========================================================================


# =========================================================================
class UnmuteUserView(APIView):
    permission_classes      = [IsModeratorOrAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request):
        from django.shortcuts import get_object_or_404
        from django.contrib.auth import get_user_model
        User = get_user_model()

        user_id = request.data.get("user_id")
        room_id = request.data.get("room_id")

        if not user_id:
            return Response({"error": "user_id required"}, status=400)

        target = get_object_or_404(User, pk=user_id)

        deleted, _ = MutedUser.objects.filter(
            user=target,
            room_id=room_id,
        ).delete()

        if not deleted:
            return Response({"error": "User is not muted."}, status=400)

        from chat.utils import send_system_message
        global_room = ChatRoom.objects.filter(room_type=RoomType.GLOBAL).first()
        target_room: int | None = room_id or (global_room.pk if global_room else None)
        if target_room:
            send_system_message(
                target_room,
                f"🔊 {target.username} has been unmuted."  # type: ignore[union-attr]
            )

        return Response({"status": "unmuted"})
# =========================================================================

# =========================================================================
class TranslateMessageView(APIView):
    permission_classes     = [IsAuthenticated]
    authentication_classes = [JWTAuthentication, SessionAuthentication]

    def post(self, request):
        text        = request.data.get("text", "").strip()
        target_lang = request.data.get("target_lang", "").strip()

        if not text:
            return Response({"error": "No text provided."}, status=400)
        if not target_lang:
            return Response({"error": "No target_lang provided."}, status=400)

        from chat.translate import translate, LANG_TO_DEEPL

        if target_lang not in LANG_TO_DEEPL:
            return Response({"error": f"Unsupported language: {target_lang}"}, status=400)

        result = translate(text, source_lang=None, target_lang=target_lang)

        if result is None:
            return Response({"error": "Translation failed."}, status=502)

        return Response({"translated_text": result})
# =========================================================================

