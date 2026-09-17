# goose_game/views.py

from rest_framework.views       import APIView
from rest_framework.response    import Response
from rest_framework.request     import Request
from rest_framework             import status, generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication

from django.shortcuts import get_object_or_404

from .models import GooseGame, GoosePlayer, GooseGameStatus
from .serializers import GooseGameSerializer


class GooseGameListCreateView(APIView):
    """List all games or create a new one."""
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get(self, request: Request) -> Response:
        games = GooseGame.objects.filter(
            status__in=[GooseGameStatus.WAITING, GooseGameStatus.IN_PROGRESS]
        ).prefetch_related("players__user")

        serializer = GooseGameSerializer(games, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request: Request) -> Response:
        name = request.data.get("name", "").strip()
        max_players = int(request.data.get("max_players", 4))
        min_players = int(request.data.get("min_players", 2))

        if max_players < 2 or max_players > 6:
            return Response({"error": "Max players must be 2-6."}, status=400)
        if min_players < 2 or min_players > max_players:
            return Response({"error": "Min players must be 2 to max_players."}, status=400)

        game = GooseGame.objects.create(
            name=name or f"{request.user.username}'s game",
            min_players=min_players,
            max_players=max_players,
            created_by=request.user,
        )

        GoosePlayer.objects.create(
            game=game,
            user=request.user,
            turn_order=0,
        )

        serializer = GooseGameSerializer(game, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class GooseGameDetailView(APIView):
    """Get game details."""
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get(self, request: Request, pk: int) -> Response:
        game = get_object_or_404(GooseGame.objects.prefetch_related("players__user"), pk=pk)
        serializer = GooseGameSerializer(game, context={"request": request})
        return Response(serializer.data)


class GooseGameJoinView(APIView):
    """Join a waiting game."""
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request, pk: int) -> Response:
        game = get_object_or_404(GooseGame, pk=pk)

        if game.status != GooseGameStatus.WAITING:
            return Response({"error": "Game is not accepting players."}, status=400)

        if game.players.count() >= game.max_players:
            return Response({"error": "Game is full."}, status=400)

        if game.players.filter(user=request.user).exists():
            return Response({"error": "Already in this game."}, status=400)

        turn_order = game.players.count()
        GoosePlayer.objects.create(
            game=game,
            user=request.user,
            turn_order=turn_order,
        )

        serializer = GooseGameSerializer(game, context={"request": request})
        return Response(serializer.data)


class GooseGameStartView(APIView):
    """Start the game (creator only)."""
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request, pk: int) -> Response:
        game = get_object_or_404(GooseGame, pk=pk)

        if game.created_by != request.user:
            return Response({"error": "Only the creator can start."}, status=403)

        if game.status != GooseGameStatus.WAITING:
            return Response({"error": "Game already started."}, status=400)

        if game.players.count() < game.min_players:
            return Response(
                {"error": f"Need at least {game.min_players} players."},
                status=400,
            )

        game.status = GooseGameStatus.IN_PROGRESS
        game.save(update_fields=["status", "updated_at"])

        serializer = GooseGameSerializer(game, context={"request": request})
        return Response(serializer.data)


class GooseGameLeaveView(APIView):
    """Leave a waiting game."""
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request, pk: int) -> Response:
        game = get_object_or_404(GooseGame, pk=pk)

        if game.status != GooseGameStatus.WAITING:
            return Response({"error": "Cannot leave a game in progress."}, status=400)

        player = game.players.filter(user=request.user).first()
        if not player:
            return Response({"error": "Not in this game."}, status=400)

        player.delete()

        # If creator leaves, cancel the game
        if game.created_by == request.user:
            game.status = GooseGameStatus.CANCELLED
            game.save(update_fields=["status", "updated_at"])

        return Response({"status": "left"})

