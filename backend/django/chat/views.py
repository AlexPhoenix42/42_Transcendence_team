# chat/views.py

from rest_framework.views           import APIView
from rest_framework.response        import Response

from rest_framework                 import generics
from rest_framework.permissions     import IsAuthenticated
from rest_framework.authentication  import SessionAuthentication

from rest_framework_simplejwt.authentication import JWTAuthentication

from rest_framework.pagination      import PageNumberPagination

from .models                        import Message, ChatRoom, RoomType

from .serializers                   import MessageSerializer


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
    pagination_class        = MessagePagination

    def get_queryset(self):
        room_id     = self.kwargs["room_id"]
        user        = self.request.user

        room        = generics.get_object_or_404(ChatRoom, id=room_id)

        if  room.room_type == RoomType.DM:
            if  not room.members.filter(id=user.pk).exists():
                self.permission_denied(self.request)

        return Message.objects.filter(room=room).select_related("sender").order_by("created_at")
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

        room = ChatRoom.objects.get_or_create_dm(request.user.pk, user_id)

        return Response({"room_id": room.pk})
# =========================================================================

