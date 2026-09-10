# pacman_game/views.py
#
# Couche REST du lobby Pac-Man, calquée sur chess_game/views.py.
#
# Modèle : un salon = une ligne Game identifiée par le slug `room_name`
# (cf. en-tête de consumers.py). Le jeu lui-même passe par le WebSocket
# `ws/pacman/<room_name>/` ; ces vues ne servent qu'à parcourir / créer /
# annuler des salons depuis le lobby.

from rest_framework.views                       import APIView
from rest_framework.response                    import Response
from rest_framework.request                     import Request

from rest_framework                             import status, generics

from rest_framework.pagination                  import PageNumberPagination

from rest_framework.permissions                 import IsAuthenticated
from rest_framework.authentication              import SessionAuthentication
from rest_framework_simplejwt.authentication    import JWTAuthentication

from django.db                                  import IntegrityError, transaction
from django.db.models                           import Q

from .models                                    import Game, GameStatus
from .serializers                               import GameSerializer


# ===========================================================================
class GamePagination(PageNumberPagination):
    page_size               = 20
    page_size_query_param   = "page_size"
    max_page_size           = 100
# ===========================================================================


_SELECT_RELATED = ("created_by",)
_PREFETCH       = ("players", "players__user")


# ===========================================================================
class GameListCreateView(generics.ListCreateAPIView):
    serializer_class        = GameSerializer
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]
    pagination_class        = GamePagination

    def get_queryset(self):
        user            = self.request.user
        status_filter   = (self.request.query_params.get("status") or "").upper()

        base = Game.objects.select_related(*_SELECT_RELATED).prefetch_related(*_PREFETCH)

        if  status_filter == "WAITING":
            # Salons ouverts, pour le lobby.
            return base.filter(status=GameStatus.WAITING).order_by("-created_at")

        if  status_filter in ("LIVE", "IN_PROGRESS"):
            # Manches en cours où je ne suis pas déjà (spectate / rejoindre).
            return base.filter(status=GameStatus.IN_PROGRESS).exclude(
                players__user=user
            ).order_by("-created_at")

        # Par défaut : mes salons (créés par moi ou où j'ai un GamePlayer).
        qs = base.filter(
            Q(created_by=user) | Q(players__user=user)
        ).distinct()

        if  status_filter:
            qs = qs.filter(status=status_filter)

        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        # room_name est validé par le serializer ; unique=True en base attrape
        # la course entre deux créations du même nom.
        try:
            with transaction.atomic():
                serializer.save(
                    created_by=self.request.user,
                    status=GameStatus.WAITING,
                )
        except IntegrityError:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"room_name": "Ce nom de salon est déjà pris."})
# ===========================================================================


# ===========================================================================
class GameDetailView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get(self, request: Request, pk: int) -> Response:
        game = generics.get_object_or_404(
            Game.objects.select_related(*_SELECT_RELATED).prefetch_related(*_PREFETCH),
            pk=pk,
        )
        return Response(GameSerializer(game).data)
# ===========================================================================


# ===========================================================================
class GameCancelView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def delete(self, request: Request, pk: int) -> Response:
        with transaction.atomic():
            game = generics.get_object_or_404(
                Game.objects.select_for_update(), pk=pk,
            )

            if  game.created_by != request.user:
                return Response(
                    {"error": "Seul le créateur peut annuler le salon."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if  game.status != GameStatus.WAITING:
                return Response(
                    {"error": "Seuls les salons en attente peuvent être annulés."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            game.status = GameStatus.CANCELLED
            game.save(update_fields=["status"])

            return Response(status=status.HTTP_204_NO_CONTENT)
# ===========================================================================
