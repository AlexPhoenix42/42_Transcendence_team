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
from django.utils                               import timezone
from datetime                                   import timedelta

from .models                                    import Game, GameStatus
from .serializers                               import GameSerializer


# Un salon en attente que plus personne ne « touche » (le consumer rafraîchit
# `last_active` toutes les ~30 s tant qu'au moins un joueur est connecté) est un
# zombie au-delà de ça : personne dedans, on le supprime. cf. le sujet
# « supprime les salons abandonnés ».
EMPTY_ROOM_TIMEOUT = timedelta(minutes=5)


def _reap_stale_waiting_rooms() -> None:
    """Balaye les salons WAITING laissés vides trop longtemps et les supprime
    (ligne Game + cache + éjection des éventuels sockets restants).

    Appelé paresseusement depuis les vues de liste : le lobby les interroge
    toutes les 5 s, donc le ménage se fait tout seul dès qu'une page est
    ouverte, sans dépendre d'une tâche de fond. Un verrou cache limite le
    balayage à ~1 fois / 30 s quel que soit le nombre de requêtes."""
    from django.core.cache import cache

    if not cache.add("pacman:reap_lock", "1", timeout=30):
        return

    cutoff = timezone.now() - EMPTY_ROOM_TIMEOUT
    stale = list(
        Game.objects
        .filter(status=GameStatus.WAITING, last_active__lt=cutoff)
        .values_list("room_name", flat=True)
    )
    if not stale:
        return

    Game.objects.filter(room_name__in=stale).delete()

    from channels.layers import get_channel_layer
    from asgiref.sync     import async_to_sync
    layer = get_channel_layer()
    for room_name in stale:
        if layer is not None:
            async_to_sync(layer.group_send)(
                f"pacman_{room_name}", {"type": "broadcast_lobby_closed"},
            )
        cache.delete(f"pacman:{room_name}")


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
        _reap_stale_waiting_rooms()

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

        # Par défaut : MES salons ACTIFS (créés par moi ou où j'ai un
        # GamePlayer). On exclut FINISHED / CANCELLED : une fois supprimé /
        # terminé, un salon ne doit plus apparaître dans "Mes salons".
        qs = base.filter(
            Q(created_by=user) | Q(players__user=user)
        ).distinct()

        if  status_filter:
            qs = qs.filter(status=status_filter)
        else:
            qs = qs.exclude(
                status__in=(GameStatus.FINISHED, GameStatus.CANCELLED),
            )

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
class GameByRoomView(APIView):
    """État d'un salon par son slug room_name. 204 si le salon n'existe pas
    encore (le front en déduit : salle d'attente vierge)."""
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get(self, request: Request, room_name: str) -> Response:
        game = Game.objects.select_related(*_SELECT_RELATED).prefetch_related(
            *_PREFETCH,
        ).filter(room_name=room_name).first()
        if game is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(GameSerializer(game).data)
# ===========================================================================


# ===========================================================================
class GameCancelView(APIView):
    """Le créateur supprime son salon (à tout moment). Les joueurs connectés
    sont éjectés (lobby_closed) et la ligne Game est supprimée."""
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def delete(self, request: Request, pk: int) -> Response:
        with transaction.atomic():
            game = generics.get_object_or_404(
                Game.objects.select_for_update(), pk=pk,
            )
            if  game.created_by_id != request.user.pk:
                return Response(
                    {"error": "Seul le créateur peut supprimer le salon."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            room_name = game.room_name
            game.delete()

        # éjecter les joueurs encore connectés au WebSocket du salon
        from channels.layers  import get_channel_layer
        from asgiref.sync      import async_to_sync
        from django.core.cache import cache
        layer = get_channel_layer()
        if layer is not None:
            async_to_sync(layer.group_send)(
                f"pacman_{room_name}", {"type": "broadcast_lobby_closed"},
            )
        cache.delete(f"pacman:{room_name}")

        return Response(status=status.HTTP_204_NO_CONTENT)
# ===========================================================================
