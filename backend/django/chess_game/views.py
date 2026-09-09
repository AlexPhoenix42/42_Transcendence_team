# chess_game/views.py

from rest_framework.views                       import APIView
from rest_framework.response                    import Response
from rest_framework.request                     import Request

from rest_framework                             import status

from rest_framework                             import generics

from rest_framework.pagination                  import PageNumberPagination

from rest_framework.permissions                 import IsAuthenticated, IsAdminUser
from rest_framework.authentication              import SessionAuthentication
from rest_framework_simplejwt.authentication    import JWTAuthentication

from channels.layers                            import get_channel_layer
from asgiref.sync                               import async_to_sync

from django.core.cache                          import cache

from django.contrib.auth                        import get_user_model

from datetime                                   import timedelta
from django.utils                               import timezone

from django.db                                  import transaction
from django.db.models                           import Q

import random
import time

from .models                                    import Game, GameResultReason, GameStatus
from .serializers                               import GameSerializer



# ===========================================================================
class GamePagination(PageNumberPagination):
    page_size               = 20
    page_size_query_param   = "page_size"
    max_page_size           = 100
# ===========================================================================


# ===========================================================================
class GameListCreateView(generics.ListCreateAPIView):
    serializer_class        = GameSerializer
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]
    pagination_class        = GamePagination

    #def get_queryset(self):
    #    user    = self.request.user

    #    qs      = Game.objects.filter(
    #        Q(player1=user) | Q(player2=user) | Q(created_by=user)
    #    ).select_related("player1", "player2", "winner", "crnt_turn", "created_by")

    #    status_filter   = self.request.query_params.get("status")

    #    if  status_filter:
    #        qs = qs.filter(status=status_filter.upper())

    #    return qs.order_by("-created_at")

    def get_queryset(self):
        user            = self.request.user

        status_filter   = self.request.query_params.get("status")

        if  status_filter and status_filter.upper() == "WAITING":
            # Show all waiting games (for lobby browsing)
            return Game.objects.filter(
                status=GameStatus.WAITING
            ).select_related(
                "player1", "player2", "winner", "crnt_turn", "created_by"
            ).order_by("-created_at")

        if  status_filter and status_filter.upper() == "LIVE":
            return Game.objects.filter(
                status=GameStatus.IN_PROGRESS
            ).exclude(
                Q(player1=user) | Q(player2=user)
            ).select_related(
                "player1", "player2", "winner", "crnt_turn", "created_by"
            ).order_by("-created_at")

        qs              = Game.objects.filter(
            Q(player1=user) | Q(player2=user) | Q(created_by=user)
        ).select_related("player1", "player2", "winner", "crnt_turn", "created_by")

        if  status_filter:
            qs = qs.filter(status=status_filter.upper())

        return qs.order_by("-created_at")


    #def perform_create(self, serializer):
    #    serializer.save(created_by=self.request.user, player1=self.request.user)

        #def perform_create(self, serializer):
        #def fen     = self.request.data.get("fen")
        #def kwargs  = {"created_by": self.request.user, "player1": self.request.user}
        #def if  fen:
        #def     kwargs["board_state"] = fen

        #def serializer.save(**kwargs)

    def perform_create(self, serializer):
        fen = self.request.data.get("fen")
        is_practice = bool(self.request.data.get("is_practice", False))
        kwargs      = {"created_by": self.request.user, "player1": self.request.user}
        if  fen:
            kwargs["board_state"] = fen

        serializer.save(**kwargs)

        #Store practice flag for later use by GameJoinView
        if  is_practice:
            cache.set(f"practice_flag:{serializer.instance.pk}", True, timeout=86400)
# ===========================================================================


# ===========================================================================
class GameCreateAIView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request) -> Response:
        ai_difficulty   = request.data.get("ai_difficulty")
        if  ai_difficulty not in ("easy", "medium", "hard"):
            return Response(
                {"error": "ai_difficulty must be 'easy', 'medium' or 'hard'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        timer   = request.data.get("timer")
        if  timer is not None and timer not in dict(Game._meta.get_field("timer").choices).keys():       # type: ignore[arg-type]
            return Response(
                {"error": "Invalid timer preset."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        custom_fen      = request.data.get("fen")
        initial_fen     = custom_fen if custom_fen else Game.INITIAL_FEN

        ai_user = get_user_model().objects.filter(username="stockfish_ai").first()

        if  ai_user is None:
            return Response(
                {"error": "AI user not found. Run migrations."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            game = Game.objects.create(
                player1=request.user,
                player2=ai_user,
                player2_is_ai=True,
                ai_difficulty=ai_difficulty,
                created_by=request.user,
                status=GameStatus.IN_PROGRESS,
                timer=timer,
                board_state=initial_fen,
            )

            game.player1_color  = random.choice([True, False])

            # This is old before adding rewind move.
            #game.crnt_turn      = game.player1 if game.player1_color else game.player2

            fen_turn = initial_fen.split(" ")[1] if " " in initial_fen else "w"
            if  fen_turn == "w":
                white_player    = game.player1 if game.player1_color else game.player2
                game.crnt_turn  = white_player 
            else:
                black_player   = game.player2 if game.player1_color else game.player1
                game.crnt_turn  = black_player


            game.save(update_fields=["player1_color", "crnt_turn", "board_state"])

            if  game.crnt_turn is None:
                return Response(
                    {"error": "Failed to determine starting turn."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            #white_player    = game.player1 if game.player1_color else game.player2
            crnt_turn_pk = game.crnt_turn.pk if game.crnt_turn else None  # type: ignore[union-attr]

            is_practice     = bool(request.data.get("is_practice", False))

            game_key        = f"game:{game.pk}"
            state           = {
                #"fen"           : Game.INITIAL_FEN,
                "fen"           : initial_fen,
                "crnt_turn"     : crnt_turn_pk,
                "check"         : False,
                "checkmate"     : False,
                "status"        : GameStatus.IN_PROGRESS,
                "is_practice"   : is_practice,
                "moves"         : [],
                "disconnected"  : {},
                "player1_id"    : game.player1_id,      # type: ignore[attr-defined]
                "player2_id"    : game.player2_id,      # type: ignore[attr-defined]
            }

            if  timer:
                try:
                    init_min, inc_sec = map(int, timer.split("+"))
                except ValueError:
                    pass
                else:
                    init_sec    = init_min * 60
                    state["clocks"] = {
                        str(game.player1_id): init_sec,     # type: ignore[attr-defined]
                        str(game.player2_id): init_sec,     # type: ignore[attr-defined]
                    }

                    state["last_tick"]  = time.time()
                    state["timer"]      = {
                        "init"          : init_sec,
                        "inc"           : inc_sec,
                    }

            cache.set(game_key, state, timeout=86400)

            #redis_client    = get_redis_connection("default")
            #redis_client.sadd("active_games", game.pk)
            active_games    = cache.get("active_games", set())
            active_games.add(str(game.pk))
            cache.set("active_games", active_games, timeout=None)

            serializer      = GameSerializer(game)

            return Response(serializer.data, status=status.HTTP_201_CREATED)
# ===========================================================================


# ===========================================================================
    #class GameCreateView(generics.CreateAPIView):
    #    serializer_class        = GameSerializer
    #    permission_classes      = [IsAuthenticated]
    #    authentication_classes  = [SessionAuthentication, JWTAuthentication]
    #
    #
    #    def perform_create(self, serializer):
    #        serializer.save(created_by=self.request.user, player1=self.request.user)
# ===========================================================================


# ===========================================================================
class GameJoinView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request, pk: int) -> Response:
        with transaction.atomic():
            game = generics.get_object_or_404(Game.objects.select_for_update(), pk=pk)

            if  game.status != GameStatus.WAITING:
                return Response(
                    {"error": "Game is not waiting for a player."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if  game.player1 == request.user:
                return Response(
                    {"error": "You cannot join your own game."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            assert request.user.is_authenticated  # guaranteed by IsAuthenticated

            game.player2        = request.user
            game.status         = GameStatus.IN_PROGRESS

            # Randomly assign who is white
            game.player1_color  = random.choice([True, False])

            #game.crnt_turn      = game.player1 if game.player1_color else game.player2

            board_state         = game.board_state

            fen_turn = board_state.split(" ")[1] if " " in board_state else "w"
            if  fen_turn == "w":
                white_player    = game.player1 if game.player1_color else game.player2
                game.crnt_turn  = white_player 
            else:
                black_player   = game.player2 if game.player1_color else game.player1
                game.crnt_turn  = black_player

            game.save()

            if  game.crnt_turn is None:
                return Response(
                    {"error": "Failed to determine starting turn."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            # Determine white player (player with first move)
            #white_player        = game.player1 if game.player1_color else game.player2

            #assert white_player is not None # both players exist at this point


            crnt_turn_pk = game.crnt_turn.pk if game.crnt_turn else None  # type: ignore[union-attr]

            is_practice         = bool(cache.get(f"practice_flag:{game.pk}"))

            # Initialize live game state in Redis
            game_key            = f"game:{game.pk}"
            cache.set(game_key, {
                #"fen"           : Game.INITIAL_FEN,
                "fen"           : game.board_state,
                "crnt_turn"     : crnt_turn_pk,
                "check"         : False,
                "checkmate"     : False,
                "status"        : GameStatus.IN_PROGRESS,
                "is_practice"   : is_practice,
                "moves"         : [],
                "disconnected"  : {},
                "player1_id"    : game.player1_id,
                "player2_id"    : game.player2_id,
            }, timeout=86400)


            # CLOCK INITIALISATION HERE
            if  game.timer:
                try:
                    init_min, inc_sec = map(int, game.timer.split("+"))

                except ValueError:
                    pass # fallback: treat as unlimited

                else:
                    init_sec    = init_min * 60
                    state       = cache.get(game_key) or {}
                    state["clocks"] = {
                        str(game.player1_id): init_sec,
                        str(game.player2_id): init_sec,
                    }
                    state["last_tick"]  = time.time()
                    state["timer"]      = {
                        "init"  : init_sec,
                        "inc"   : inc_sec,
                    }
                    cache.set(game_key, state, timeout=86400)


            # Add to active games set so the timeout checker can find it
            #redis_client = get_redis_connection("default")
            #redis_client.sadd("active_games", game.pk)
            active_games    = cache.get("active_games", set())
            active_games.add(str(game.pk))
            cache.set("active_games", active_games, timeout=None)

            serializer          = GameSerializer(game)

            return Response(serializer.data, status=status.HTTP_200_OK)
# ===========================================================================


# ===========================================================================
class GameCancelView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def delete(self, request: Request, pk: int) -> Response:
        with transaction.atomic():
            game = generics.get_object_or_404(Game.objects.select_for_update(), pk=pk)

            if  game.created_by != request.user:
                return Response(
                    {"error": "Only the creator can cancel the game."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if  game.status != GameStatus.WAITING:
                return Response(
                    {"error": "Only WAITING games can be cancelled."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            game.status         = GameStatus.CANCELLED
            game.result_reason  = GameResultReason.CANCELLED
            game.save()

            return Response(status=status.HTTP_204_NO_CONTENT)
# ===========================================================================


# ===========================================================================
class GameLeaveView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request, pk: int) -> Response:
        with transaction.atomic():
            game = generics.get_object_or_404(Game.objects.select_for_update(), pk=pk)

            if  game.status != GameStatus.IN_PROGRESS:
                return Response(
                    {"error": "Game is not in progress."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            
            if  request.user not in [game.player1, game.player2]:
                return Response(
                    {"error": "You are not a player in this game."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            opponent = game.player2 if game.player1 == request.user else game.player1

            assert opponent is not None # guaranteed by game being IN_PROGRESS

            game.winner         = opponent
            game.result_reason  = GameResultReason.RESIGNATION
            game.status         = GameStatus.FINISHED

            # TODO: persist board_state and moves from Redis (when integration is added)
            # TODO IS DONE!

            # Flush Redis state to DB before finalizing
            game_key    = f"game:{game.pk}"
            live_state  = cache.get(game_key) or {}

            game.board_state    = live_state.get("fen", game.board_state)
            game.moves          = live_state.get("moves", [])
            game.save()

            # Mark game finished in Redis so consumers reject further moves
            live_state["status"]    = GameStatus.FINISHED
            cache.set(game_key, live_state, timeout=86400)

            # Remove from active set so the checker stops monitoring
            #redis_client = get_redis_connection("default")
            #redis_client.srem("active_games", game.pk)
            active_games    = cache.get("active_games", set())
            active_games.discard(str(game.pk))
            cache.set("active_games", active_games, timeout=None)

            # Broadcast game_over to both players via WebSocket
            channel_layer  = get_channel_layer()

            assert channel_layer is not None, "Channel layer is not configured."
            
            async_to_sync(channel_layer.group_send)(
                f"game_{game.pk}",
                {
                    "type"      : "game_over",
                    "winner"    : opponent.pk,
                    "reason"    : GameResultReason.RESIGNATION,
                }
            )

            return Response(
                {"status": "Game finished", "winner": opponent.username},
                status=status.HTTP_200_OK,
            )
# ===========================================================================


# ===========================================================================
class GameCleanupView(APIView):
    permission_classes      = [IsAdminUser]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request) -> Response:
        timeout_minutes     = request.data.get("timeout", 30)
        cutoff              = timezone.now() - timedelta(minutes=timeout_minutes)

        stale_games         = Game.objects.filter(
            status=GameStatus.WAITING,
            created_at__lt=cutoff,
        )

        cnt                 = stale_games.count()
        stale_games.update(
            status=GameStatus.CANCELLED,
            result_reason=GameResultReason.CANCELLED,
        )

        return Response(
            {"status": "Cleanup completed", "cancelled": cnt},
            status=status.HTTP_200_OK,
        )
# ===========================================================================


# ===========================================================================
class GameDetailView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get(self, request: Request, pk: int) -> Response:
        game = generics.get_object_or_404(
            Game.objects.select_related(
                "player1", "player2", "winner", "crnt_turn", "created_by"),
            pk=pk,
        )

        serializer = GameSerializer(game)
        return Response(serializer.data)
# ===========================================================================


# ===========================================================================
class GameAcceptInviteView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request) -> Response:
        invite_id = request.data.get("invite_id")
        if  not invite_id:
            return Response({"error": "invite_id required"}, status=400)

        invite_data = cache.get(f"game_invite:{invite_id}")
        if  not invite_data:
            return Response({"error": "Invite expired or invalid"}, status=400)

        from_user_id = invite_data["from_user_id"]

        if  request.user.pk == from_user_id:
            return Response({"error": "Cannot accept your own invite"}, status=400)

        from_user = get_user_model().objects.get(pk=from_user_id)

        with transaction.atomic():
            game = Game.objects.create(
                player1=from_user,
                player2=request.user,
                created_by=from_user,
                status=GameStatus.IN_PROGRESS,
            )

            game.player1_color = random.choice([True, False])
            game.crnt_turn = game.player1 if game.player1_color else game.player2
            game.save(update_fields=["player1_color", "crnt_turn"])

            white_player = game.player1 if game.player1_color else game.player2

            game_key = f"game:{game.pk}"
            state = {
                "fen": Game.INITIAL_FEN,
                "crnt_turn": white_player.pk,
                "check": False,
                "checkmate": False,
                "status": GameStatus.IN_PROGRESS,
                "moves": [],
                "disconnected": {},
                "player1_id": game.player1_id,
                "player2_id": game.player2_id,
            }

            cache.set(game_key, state, timeout=86400)

            active_games = cache.get("active_games", set())
            active_games.add(str(game.pk))
            cache.set("active_games", active_games, timeout=None)

        # Consume the invite
        cache.delete(f"game_invite:{invite_id}")

        # Notify both users via the DM room
        room_id = invite_data.get("room_id")
        if  room_id:
            from chat.utils import send_system_message
            send_system_message(room_id, f"⚔️ Game started! {from_user.username} vs {request.user.username}")  # type: ignore[union-attr]

            # Broadcast game_started so both users navigate
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync

            channel_layer = get_channel_layer()
            if  channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f"chat_room_{room_id}",
                    {
                        "type": "game_started",
                        "game_id": game.pk,
                    },
                )

        serializer = GameSerializer(game)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
# ===========================================================================

