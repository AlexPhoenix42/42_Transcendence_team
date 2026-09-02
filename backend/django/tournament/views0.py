# tournament/views.py

from typing                         import TYPE_CHECKING

from rest_framework.views           import APIView
from rest_framework.response        import Response
from rest_framework.request         import Request
from rest_framework                 import status

from rest_framework                 import generics
from rest_framework.permissions     import IsAdminUser, IsAuthenticated
from rest_framework.authentication  import SessionAuthentication

from rest_framework_simplejwt.authentication    import JWTAuthentication

from rest_framework.throttling      import UserRateThrottle

from django.db                      import transaction, models

from django.contrib.auth            import get_user_model

from django_redis                   import get_redis_connection

from django.core.cache              import cache

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

from .bracket                       import advanced_bracket



if  TYPE_CHECKING:
    from users.models import User as User
else:
    User = get_user_model()

# ==========================================================================
class TournamentListCreateView(generics.ListCreateAPIView):
    queryset            = Tournament.objects.all()
    serializer_class    = TournamentSerializer
    permission_classes  = [IsAdminUser]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
# ==========================================================================


# ==========================================================================
class TournamentParticipantListView(generics.ListAPIView):
    serializer_class        = TournamentParticipantSerializer
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [SessionAuthentication, JWTAuthentication]

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
    authentication_classes  = [SessionAuthentication, JWTAuthentication]
    throttle_classes        = [UserRateThrottle]

    def post(self, request, tournament_id):
        tournament = generics.get_object_or_404(Tournament, id=tournament_id)

        if  tournament.status != TournamentStatus.OPEN:
            return Response(
                {"error": "Tournament is not open for joining."},
                status=status.HTTP_400_BAD_REQUEST)

        if  TournamentParticipant.objects.filter(
            tournament=tournament, player=request.user).exists():
            return Response(
                {"error": "You have already joined this tournament."},
                status=status.HTTP_400_BAD_REQUEST)

        #current_cnt = tournament.participants.count()
        current_cnt = TournamentParticipant.objects.filter(tournament=tournament).count()
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
    authentication_classes  = [SessionAuthentication, JWTAuthentication]

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
    permission_classes      = [IsAdminUser]
    authentication_classes  = [SessionAuthentication, JWTAuthentication]

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
    
        random.shuffle(participants)

        matches_to_create = []
        bye_player = None

        i = 0
        while i < len(participants):
            if  i + 1 < len(participants):
                p1 = participants[i].player
                p2 = participants[i+1].player

                matches_to_create.append(
                    Match(
                        tournament=tournament,
                        player1=p1,
                        player2=p2,
                        round_nb=1,
                        status=MatchStatus.PENDING,
                    ),
                )
                i += 2

            else:
                # Odd number, the left-out player gets a bye
                bye_player = participants[i].player
                matches_to_create.append(
                    Match(
                        tournament=tournament,
                        player1=bye_player,
                        player2=None,
                        winner=bye_player, # automatically addvances
                        round_nb=1,
                        status=MatchStatus.FINISHED,
                    ),
                )
                i += 1

        Match.objects.bulk_create(matches_to_create)

        tournament.status = TournamentStatus.ONGOING
        tournament.save(update_fields=["status", "updated_at"])

        matches     = Match.objects.filter(
            tournament=tournament, round_nb=1).order_by("id")

        serializer  = MatchSerializer(matches, many=True) 

        return Response(
            {"status": "Tournament started.", "matches": serializer.data},
            status=status.HTTP_200_OK,
        )
# ==========================================================================


# ==========================================================================
class MatchResultUpdateView(APIView):
    permission_classes      = [IsAdminUser]
    authentication_classes  = [SessionAuthentication, JWTAuthentication]

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

        match.winner    = winner
        match.status    = MatchStatus.FINISHED
        match.save()

        advanced_bracket(match)

        if  not Match.objects.filter(
                tournament=match.tournament,
                status__in=[MatchStatus.PENDING, MatchStatus.IN_PROGRESS],
            ).exists():
            match.tournament.status = TournamentStatus.FINISHED
            match.tournament.save(update_fields=["status", "updated_at"])

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
            m.save()
            updated_ids.append(m.pk)

        # 4. Advance the bracket for each finished match
        for match_id in updated_ids:
            match = Match.objects.get(pk=match_id)
            advanced_bracket(match)

        # 5. Remove the player from the tournament
        TournamentParticipant.objects.filter(
            tournament=tournament, player=player,
        ).delete()

        # 6.Return the list of updated match IDs
        return updated_ids
# ==========================================================================


# ==========================================================================
class TournamentForfeitView(BaseForfeitView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [SessionAuthentication, JWTAuthentication]

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

            if  not Match.objects.filter(
                    tournament=tournament,
                    status__in=[MatchStatus.PENDING, MatchStatus.IN_PROGRESS]
                ).exists():
                tournament.status = TournamentStatus.FINISHED
                tournament.save(update_fields=["status", "updated_at"])

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
    permission_classes      = [IsAdminUser]
    authentication_classes  = [SessionAuthentication, JWTAuthentication]

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

            if  not Match.objects.filter(
                    tournament=tournament,
                    status__in=[MatchStatus.PENDING, MatchStatus.IN_PROGRESS],
                ).exists():
                tournament.status = TournamentStatus.FINISHED
                tournament.save(update_fields=["status", "updated_at"])


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
    authentication_classes  = [SessionAuthentication, JWTAuthentication]

    def get_queryset(self):
        tournament_id = self.kwargs["tournament_id"]

        return Match.objects.filter(
            tournament_id=tournament_id,
        ).select_related("player1", "player2", "winner").order_by("round_nb", "id")
# ==========================================================================


# ==========================================================================
class MatchStartView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [SessionAuthentication, JWTAuthentication]


    def post(self, request: Request, tournament_id: int, match_id: int) -> Response:
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
            # Lock the match row to prevent race conditions
            match = generics.get_object_or_404(
                Match.objects.select_for_update()
                .select_related("player1", "player2")
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
            game_key        = f"game:{game.pk}" 
            state           = {
                "fen"           : Game.INITIAL_FEN,
                "crnt_turn"     : white_player.pk,
                "check"         : False,
                "checkmate"     : False,
                "status"        : "IN_PROGRESS",
                "moves"         : [],
                "disconnected"  : {},
                "player1_id"    : game.player1_id,
                "player2_id"    : game.player2_id,
            }

            if  tournament.timer:
                try:
                    init_min, inc_sec = map(int, tournament.timer.split("+"))
                except ValueError:
                    pass
                else:
                    init_sec        = init_min * 60
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

            # Add to active games set for the timeout checker
            redis_client    = get_redis_connection("default")
            redis_client.sadd("active_games", game.pk)

            serializer      = GameSerializer(game)

            return Response(serializer.data, status=status.HTTP_201_CREATED)
# ==========================================================================

