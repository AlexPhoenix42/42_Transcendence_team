# tournament/views.py

from typing                         import TYPE_CHECKING

from rest_framework.views           import APIView
from rest_framework.response        import Response
from rest_framework.request         import Request
from rest_framework                 import status

from rest_framework                 import generics
from rest_framework.permissions     import IsAuthenticated
from users.permissions              import IsModeratorOrAdmin
from rest_framework.authentication  import SessionAuthentication

from rest_framework_simplejwt.authentication    import JWTAuthentication

from rest_framework.throttling      import UserRateThrottle

from django.db                      import transaction, models

from django.contrib.auth            import get_user_model


from django.core.cache              import cache

import asyncio
import random
import time

from chess_game.models              import Game
from chess_game.serializers         import GameSerializer

from .models                        import (
    Tournament, TournamentParticipant, TournamentStatus,
    Match, MatchStatus
)


from .serializers                   import (
    TournamentSerializer, TournamentParticipantSerializer, MatchSerializer
)

from .bracket                       import build_bracket


if  TYPE_CHECKING:
    from users.models import User as User
else:
    User = get_user_model()

# ==========================================================================
class TournamentListCreateView(generics.ListCreateAPIView):
    queryset            = Tournament.objects.all()
    serializer_class    = TournamentSerializer
    permission_classes  = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def perform_create(self, serializer):
        if  not self.request.user.is_staff:     # type: ignore[union-attr]
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Only admins can create tournaments.")
        serializer.save(created_by=self.request.user)
# ==========================================================================


# ==========================================================================
class TournamentParticipantListView(generics.ListAPIView):
    serializer_class        = TournamentParticipantSerializer
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get_queryset(self):
        tournament_id   = self.kwargs["tournament_id"]
        generics.get_object_or_404(Tournament, id=tournament_id)

        return TournamentParticipant.objects.filter(
            tournament_id=tournament_id,
        ).select_related("player").order_by("joined_at")
# ==========================================================================


# ==========================================================================
class TournamentJoinView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]
    throttle_classes        = [UserRateThrottle]

    def post(self, request, tournament_id):
        # Lock the tournament row to prevent concurrent capacity changes
        with transaction.atomic():
            tournament = generics.get_object_or_404(
                Tournament.objects.select_for_update(), id=tournament_id)

            if  tournament.status != TournamentStatus.OPEN:
                return Response(
                    {"error": "Tournament is not open for joining."},
                    status=status.HTTP_400_BAD_REQUEST)

            if  TournamentParticipant.objects.filter(
                tournament=tournament, player=request.user).exists():
                return Response(
                    {"error": "You have already joined this tournament."},
                    status=status.HTTP_400_BAD_REQUEST)

            current_cnt = TournamentParticipant.objects.filter(
                tournament=tournament).count()
            if  current_cnt >= tournament.max_players:
                return Response(
                    {"error": "Tournament is full."},
                    status=status.HTTP_400_BAD_REQUEST)

            participant    = TournamentParticipant.objects.create(
                tournament=tournament,
                player=request.user,
            )

            serializer      =   TournamentParticipantSerializer(participant) 

            return Response(serializer.data, status=status.HTTP_201_CREATED)
# ==========================================================================


# ==========================================================================
class TournamentLeaveView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def delete(self, request, tournament_id):
        tournament  = generics.get_object_or_404(Tournament, id=tournament_id)

        if  tournament.status != TournamentStatus.OPEN:
            return Response(
                {"error": "Tournament is not open for leaving."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        participant = TournamentParticipant.objects.filter(
            tournament=tournament,
            player=request.user,
        ).first()

        if  not participant:
            return Response(
                {"error": "You are not a participant in this tournament."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        participant.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)
# ==========================================================================


# ==========================================================================
class TournamentStartView(APIView):
    permission_classes      = [IsModeratorOrAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request, tournament_id: int) -> Response:
        tournament = generics.get_object_or_404(Tournament, id=tournament_id)

        if  tournament.status != TournamentStatus.OPEN:
            return Response(
                {"error": "Tournament is not open."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        participants: list[TournamentParticipant] = list(
            TournamentParticipant.objects.filter(
                tournament=tournament).select_related("player")
        )

        if  len(participants) < 2:
            return Response(
                {"error": "At least 2 participants are required to start the tournament."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Build the full bracket (all rounds) using the new system
        build_bracket(tournament)

        tournament.status = TournamentStatus.ONGOING
        tournament.save(update_fields=["status", "updated_at"])

        # Auto-start any AI vs AI matches in round 1
        from .signals import _auto_start_ai_matches
        _auto_start_ai_matches(tournament)

        # Return all matches (not just round 1)
        matches = Match.objects.filter(tournament=tournament).order_by("round_nb", "id")

        # Return all matches (not just round 1)
        matches = Match.objects.filter(tournament=tournament).order_by("round_nb", "id")

        serializer = MatchSerializer(matches, many=True)

        return Response(
            {"status": "Tournament started.", "matches": serializer.data},
            status=status.HTTP_200_OK
        )
# ==========================================================================


# ==========================================================================
class MatchResultUpdateView(APIView):
    permission_classes      = [IsModeratorOrAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def patch(self, request: Request, tournament_id: int, match_id: int) -> Response:
        match = generics.get_object_or_404(
            Match.objects.filter(tournament_id=tournament_id),
            id=match_id
        )

        if  match.status not in [MatchStatus.PENDING, MatchStatus.IN_PROGRESS]:
            return Response(
                {"error": "Match is already finished."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if  match.tournament.status != TournamentStatus.ONGOING:
            return Response(
                {"error": "Tournament is not in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )


        winner_id   = request.data.get("winner")
        if  not winner_id:
            return Response(
                {"error": "Winner is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            winner = User.objects.get(pk=winner_id)
        except User.DoesNotExist:
            return Response(
                {"error": "Winner user does not exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if  winner not in [match.player1, match.player2]:
            return Response(
                {"error": "Winner must be one of the match players."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            match.winner    = winner
            match.status    = MatchStatus.FINISHED
            match.save()    # The Match post_save signal will call advance_winner and finish tournament automatically

        return Response(
            {"status": "Match result recorded", "match_id": match.pk},)
# ==========================================================================


# ==========================================================================
class BaseForfeitView(APIView):
    """Base class with shared logic for forfeit and disqualify."""
    @staticmethod
    def forfeit_player_matches(tournament: Tournament, player: User) -> list[int]:
        # 1. Find all pending/in-progress matches involving the player
        matches     = Match.objects.filter(
            tournament=tournament,
            status__in=[MatchStatus.PENDING, MatchStatus.IN_PROGRESS],
        ).filter(
            models.Q(player1=player) | models.Q(player2=player)
        )

        # 2. Early exit if no active matches (player already eliminated)
        if  not matches.exists():
            return []

        # 3. For each active match, set the opponent as winner
        updated_ids = []
        for m in matches:
            opponent = m.player2 if m.player1 == player else m.player1
            m.winner = opponent
            m.status = MatchStatus.FINISHED
            m.save()    # The Match signal will call advance_winner automatically
            updated_ids.append(m.pk)

        # 4. Remove the player from the tournament
        TournamentParticipant.objects.filter(
            tournament=tournament, player=player,
        ).delete()

        # 5.Return the list of updated match IDs
        return updated_ids
# ==========================================================================


# ==========================================================================
class TournamentForfeitView(BaseForfeitView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request, tournament_id: int) -> Response:
        #get the tournament (404 if not found)
        tournament = generics.get_object_or_404(Tournament, id=tournament_id)

        # Only ONGOING tournaments can be forfeited
        if  tournament.status != TournamentStatus.ONGOING:
            return Response(
                {"error": "Tournament is not in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        assert request.user.is_authenticated  # guaranteed by IsAuthenticated

        # Verify the player is a participant
        if  not TournamentParticipant.objects.filter(
                tournament=tournament, 
                player=request.user,
            ).exists(): 
            return Response(
                {"error": "You are not a participant in this tournament."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Process the forfeit
        with transaction.atomic():
            updated_ids = self.forfeit_player_matches(tournament, request.user)    # pyright: ignore[reportArgumentType]

            if  not updated_ids:
                return Response(
                    {"error": "No active matches to forfeit."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            return Response(
                {
                    "status"            : "Forfeit Process",
                    "player"            : request.user.username,    # pyright: ignore[reportAttributeAccessIssue]
                    "updated_matches"   : updated_ids,
                },
                status=status.HTTP_200_OK,
            )
# ==========================================================================


# ==========================================================================
class TournamentDisqualifyView(BaseForfeitView):
    permission_classes      = [IsModeratorOrAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request, tournament_id: int) -> Response:
        # Get the tournament (303 if not found)
        tournament = generics.get_object_or_404(Tournament, id=tournament_id)

        # Only ONGOING tournaments can be disqualified
        if  tournament.status != TournamentStatus.ONGOING:
            return Response(
                {"error": "Tournament is not in progress."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Extract and validate player_id from request body
        player_id = request.data.get("player_id")
        if  not player_id:
            return Response(
                {"error": "player_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            player = User.objects.get(pk=player_id)
        except User.DoesNotExist:
            return Response(
                {"error": "Player does not exist."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify the player is a participant
        if  not TournamentParticipant.objects.filter(
                tournament=tournament, player=player,
            ).exists():
            return Response(
                {"error": "Player is not a participant in this tournament."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Process the disqualification
        with transaction.atomic():
            updated_ids = self.forfeit_player_matches(tournament, player)

            if  not updated_ids:
                return Response(
                    {"error": "No active matches to disqualify."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            return Response(
                {
                    "status"            : "Disqualification Processed",
                    "player"            : player.username,  # pyright: ignore[reportAttributeAccessIssue]
                    "updated_matches"   : updated_ids,
                },
                status=status.HTTP_200_OK,
            )
# ==========================================================================


# ==========================================================================
class TournamentMatchListView(generics.ListAPIView):
    serializer_class        = MatchSerializer
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get_queryset(self):
        tournament_id = self.kwargs["tournament_id"]

        return Match.objects.filter(
            tournament_id=tournament_id,
        ).select_related("player1", "player2", "winner").order_by("round_nb", "id")
# ==========================================================================


# ==========================================================================
class MatchStartView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request, tournament_id: int, match_id: int) -> Response:
        import traceback
        try:
            tournament  =  generics.get_object_or_404(Tournament, id=tournament_id)

            if  tournament.status != TournamentStatus.ONGOING:
                return Response(
                    {"error": "Tournament is not in progress."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            match = generics.get_object_or_404(
                Match.objects.filter(tournament=tournament),
                id=match_id,
            )

            with transaction.atomic():
                match = generics.get_object_or_404(
                    Match.objects.select_for_update()
                    .filter(tournament=tournament),
                    id=match_id,
                )

                if  match.status != MatchStatus.PENDING:
                    return Response(
                        {"error": "Match is not pending."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if  request.user not in [match.player1, match.player2]:
                    return Response(
                        {"error": "You are not a player in this match"},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                if  match.game:
                    return Response(
                        {"error": "A game has already been created for this match."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Create the game, inheriting the tournaments time control if set
                game    = Game.objects.create(
                    player1=match.player1,
                    player2=match.player2,
                    created_by=request.user,
                    status="IN_PROGRESS",
                    timer=tournament.timer,
                )

                match.game      = game
                match.status    = MatchStatus.IN_PROGRESS
                match.save(update_fields=["game", "status", "updated_at"])

                # Seed Redis with the initial game state and optional clocks
                # Random assign colors
                game.player1_color  = random.choice([True, False])
                game.crnt_turn      = game.player1 if game.player1_color else game.player2

                game.save(update_fields=["player1_color", "crnt_turn"])

                white_player    = game.player1 if game.player1_color else game.player2

                assert white_player is not None # satisfies type checker

                game_key        = f"game:{game.pk}" 
                state: dict     = {
                    "fen"           : Game.INITIAL_FEN,
                    "crnt_turn"     : white_player.pk,
                    "check"         : False,
                    "checkmate"     : False,
                    "status"        : "IN_PROGRESS",
                    "moves"         : [],
                    "disconnected"  : {},
                    "player1_id"    : game.player1_id,  # type: ignore[reportAttributeAccessIssue]
                    "player2_id"    : game.player2_id,  # type: ignore[reportAttributeAccessIssue]
                }

                if  tournament.timer:
                    try:
                        init_min, inc_sec = map(int, tournament.timer.split("+"))
                    except ValueError:
                        pass
                    else:
                        init_sec        = init_min * 60
                        state["clocks"] = {
                            str(game.player1_id): init_sec, # type: ignore[reportAttributeAccessIssue]
                            str(game.player2_id): init_sec, # type: ignore[reportAttributeAccessIssue]
                        }
                        state["last_tick"]  = time.time()
                        state["timer"]      = {
                            "init"  : init_sec,
                            "inc"   : inc_sec,
                        }

                cache.set(game_key, state, timeout=86400)

                # Add to active games set for the timeout checker
                active_games    = cache.get("active_games", set())
                active_games.add(str(game.pk))
                cache.set("active_games", active_games, timeout=None)

                serializer      = GameSerializer(game)

                # If both players are AI, start auto-play
                p1_name = game.player1.username if game.player1 else ""
                p2_name = game.player2.username if game.player2 else ""
                if p1_name.startswith("stockfish_ai") and p2_name.startswith("stockfish_ai"):
                    import threading
                    from chess_game.ai_autoplay import run_ai_game
                    threading.Thread(
                        target=lambda gid=game.pk: asyncio.run(run_ai_game(gid)),
                        daemon=True,
                    ).start()

                return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception:   # noqa: BLE001
            traceback.print_exc()
            return Response(
                {"error": "Internal server error"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
# ==========================================================================


# ==========================================================================
class TournamentDetailView(generics.RetrieveAPIView):
    queryset            = Tournament.objects.all()
    serializer_class    = TournamentSerializer
    permission_classes  = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]
    lookup_url_kwarg    = "tournament_id"
# ==========================================================================


# ==========================================================================
class TournamentCancelView(APIView):
    permission_classes      = [IsModeratorOrAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request, tournament_id: int) -> Response:
        tournament = generics.get_object_or_404(Tournament, id=tournament_id)

        if  tournament.status == TournamentStatus.FINISHED:
            return Response(
                {"error": "Tournament is already finished."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if  tournament.status == TournamentStatus.CANCELLED:
            return Response(
                {"error": "Tournament is already cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tournament.status = TournamentStatus.CANCELLED
        tournament.save(update_fields=["status", "updated_at"])

        return Response({"status": "Tournament cancelled."})
# ==========================================================================


# ==========================================================================
class TournamentDeleteView(APIView):
    permission_classes      = [IsModeratorOrAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def delete(self, request: Request, tournament_id: int) -> Response:
        tournament = generics.get_object_or_404(Tournament, id=tournament_id)

        if  tournament.status == TournamentStatus.ONGOING:
            return Response(
                {"error": "Cancel the tournament before deleting."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tournament.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
# ==========================================================================


# ==========================================================================
class TournamentAddAIView(APIView):
    permission_classes      = [IsModeratorOrAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def post(self, request: Request, tournament_id: int) -> Response:
        tournament = generics.get_object_or_404(Tournament, id=tournament_id)

        if  tournament.status != TournamentStatus.OPEN:
            return Response(
                {"error": "Tournament is not open."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        count = request.data.get("count", 0)
        try:
            count = int(count)
        except (TypeError, ValueError):
            return Response(
                {"error": "count must be a number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if  count < 1 or count > 15:
            return Response(
                {"error": "count must be between 1 and 15."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_count = TournamentParticipant.objects.filter(tournament=tournament).count()
        if  current_count + count > tournament.max_players:
            return Response(
                {"error": f"Would exceed max players ({tournament.max_players})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        added = []
        for i in range(1, count + 1):
            ai_name = f"stockfish_ai_{i}"
            ai_user, _ = User.objects.get_or_create(
                username=ai_name,
                defaults={"email": f"{ai_name}@local", "email_verfd": True},
            )

            if  TournamentParticipant.objects.filter(tournament=tournament, player=ai_user).exists():
                continue

            TournamentParticipant.objects.create(tournament=tournament, player=ai_user)
            added.append(ai_name)

        return Response(
            {"status": f"Added {len(added)} AI players", "added": added},
            status=status.HTTP_201_CREATED,
        )
# ==========================================================================

