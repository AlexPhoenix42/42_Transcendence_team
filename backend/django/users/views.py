#from django.shortcuts import render


from rest_framework.views import APIView
#from rest_framework import authentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication
from users.api_key import APIKeyAuthentication

from rest_framework.response import Response
from rest_framework.request import Request

#from django.db.models import F

from .permissions import IsAdmin

from .models import User

from typing import cast
# ===========================================================================
# About 'from typing import cast'
#Case for keeping the cast:
#
#Beyond just silencing the warning, it actually gives you real IDE benefits going forward: autocomplete will now correctly suggest user.is_online, user.rating, user.bio, etc., since Pyright now knows the concrete type. Without the cast, autocomplete on request.user would only offer generic base-user attributes, missing your custom ones entirely.
#If you (or teammates later) typo a field name (e.g., user.rateing), the cast lets the type checker catch that before runtime — a real bug-prevention benefit, not just cosmetic.
#
#Case against (minor):
#
#One extra line, one extra import — negligible cost.
#It's technically "lying" to the type checker in the sense that if this method were ever called somewhere permission_classes didn't guarantee authentication, the cast would hide a real potential bug (accessing attributes on AnonymousUser, which would crash at runtime). But that's true of casts generally — the assumption needs to stay valid.
# ===========================================================================


# ===========================================================================
class MeView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication, APIKeyAuthentication]

    def get(self, request:Request, format=None):
        user = cast(User, request.user)
        resp = {
                "id":           user.pk,
                "username":     user.username,
                "email":        user.email,
                "is_online":    user.is_online, 
                "rating":       user.rating, 
                "bio":          user.bio,
                "is_staff":     user.is_staff,
                "role":         user.role,
                "avatar":       request.build_absolute_uri(user.avatar.url) if user.avatar else None,
                "language":     user.language,
        }
        return Response(resp)

    def patch(self, request: Request, format=None):
        user = cast(User, request.user)
        language = request.data.get("language")
        if language:
            valid_codes = [c[0] for c in User.LANGUAGE_CHOICES]
            if language not in valid_codes:
                return Response({"error": f"Supported languages: {', '.join(valid_codes)}"}, status=400)
            user.language = language
            user.save(update_fields=["language"])
        return Response({"language": user.language})
# ===========================================================================


# ===========================================================================
class LeaderboardView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication, APIKeyAuthentication]

    def get(self, request: Request, format=None):

        users = User.objects.filter(
            is_active=True,
        ).exclude(
            username__startswith="stockfish_ai"
        ).order_by("-rating", "-wins")[:50]

        data =[
            {
                "rank": idx + 1,
                "username": u.username,
                "dispname": u.dispname,
                "rating": u.rating,
                "wins": u.wins,
                "loss": u.loss,
                "draw": u.draw,
                "avatar": request.build_absolute_uri(u.avatar.url) if u.avatar else None,
                "is_online": u.is_online,
                "role": u.role,
            }
            for idx, u in enumerate(users)
        ]

        return Response(data)
# ===========================================================================


# ===========================================================================
class MatchHistoryView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication, APIKeyAuthentication]

    def get(self, request: Request, username: str | None = None, format=None):
        if username:
            from django.shortcuts import get_object_or_404
            target = get_object_or_404(User, username=username)
        else:
            target = cast(User, request.user)

        from chess_game.models import Game, GameStatus
        from django.db.models import Q

        games = Game.objects.filter(
            Q(player1=target) | Q(player2=target),
            status=GameStatus.FINISHED,
        ).exclude(
            # Exclude practice games by checking Redis — not reliable for old games
            # Instead just show all finished games
        ).select_related(
            "player1", "player2", "winner"
        ).order_by("-updated_at")[:50]

        data = []
        for g in games:
            opponent = g.player2 if g.player1 == target else g.player1
            if g.winner is None:
                result = "draw"
            elif g.winner == target:
                result = "win"
            else:
                result = "loss"

            data.append({
                "id": g.pk,
                "opponent": opponent.username if opponent else "Unknown",
                "opponent_avatar": request.build_absolute_uri(opponent.avatar.url) if opponent and opponent.avatar else None,
                "result": result,
                "result_reason": g.result_reason or "",
                "player_color": "white" if (g.player1 == target and g.player1_color) or (g.player2 == target and not g.player1_color) else "black",
                "moves_count": len(g.moves) if g.moves else 0,
                "date": g.updated_at.isoformat(),
                "player2_is_ai": g.player2_is_ai,
            })

        return Response(data)
# ===========================================================================


# ===========================================================================
class UserAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication, APIKeyAuthentication]

    def get(self, request: Request, format=None):
        from chess_game.models import Game, GameStatus
        from django.db.models import Q
        from django.utils import timezone
        from datetime import timedelta, datetime

        user = cast(User, request.user)

        # Date range filtering
        date_from = request.query_params.get("from")
        date_to = request.query_params.get("to")

        # Order oldest-first so we can build rating history chronologically
        games = Game.objects.filter(
            Q(player1=user) | Q(player2=user),
            status=GameStatus.FINISHED,
        ).select_related("player1", "player2", "winner").order_by("updated_at")

        if date_from:
            try:
                dt = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                games = games.filter(updated_at__gte=dt)
            except ValueError:
                pass

        if date_to:
            try:
                dt = datetime.strptime(date_to, "%Y-%m-%d").replace(
                    hour=23, minute=59, second=59, tzinfo=timezone.utc
                )
                games = games.filter(updated_at__lte=dt)
            except ValueError:
                pass

        total = games.count()
        if total == 0:
            return Response({
                "total_games": 0,
                "win_rate": 0,
                "games_this_week": 0,
                "games_this_month": 0,
                "white_wins": 0, "white_total": 0,
                "black_wins": 0, "black_total": 0,
                "ai_wins": 0, "ai_total": 0,
                "human_wins": 0, "human_total": 0,
                "avg_moves": 0,
                "recent_form": [],
                "most_played": [],
                "longest_win_streak": 0,
                "current_streak": {"type": "none", "count": 0},
                "rating_history": [],
                "daily_results": [],
            })

        now = timezone.now()
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        wins = 0
        white_wins = 0
        white_total = 0
        black_wins = 0
        black_total = 0
        ai_wins = 0
        ai_total = 0
        human_wins = 0
        human_total = 0
        total_moves = 0
        recent_results = []
        opponent_counts: dict[str, int] = {}

        longest_streak = 0
        temp_streak = 0

        # For charts
        rating_history = []
        simulated_rating = 1200
        daily_buckets: dict[str, dict[str, int]] = {}

        for g in games:
            is_p1 = g.player1 == user
            played_white = (is_p1 and g.player1_color) or (not is_p1 and not g.player1_color)

            if g.winner is None:
                result = "draw"
            elif g.winner == user:
                result = "win"
                wins += 1
            else:
                result = "loss"

            # White/black stats
            if played_white:
                white_total += 1
                if result == "win":
                    white_wins += 1
            else:
                black_total += 1
                if result == "win":
                    black_wins += 1

            # AI/human stats
            if g.player2_is_ai:
                ai_total += 1
                if result == "win":
                    ai_wins += 1
            else:
                human_total += 1
                if result == "win":
                    human_wins += 1

            # Moves
            total_moves += len(g.moves) if g.moves else 0

            # Collect all results (oldest first)
            recent_results.append(result)

            # Opponent tracking
            opponent = g.player2 if is_p1 else g.player1
            if opponent and not opponent.username.startswith("stockfish_ai"):
                opp_name = opponent.username
                opponent_counts[opp_name] = opponent_counts.get(opp_name, 0) + 1

            # Win streak
            if result == "win":
                temp_streak += 1
                longest_streak = max(longest_streak, temp_streak)
            else:
                temp_streak = 0

            # Rating progression (simulated: +25 win, -25 loss, +0 draw)
            if result == "win":
                simulated_rating += 25
            elif result == "loss":
                simulated_rating = max(100, simulated_rating - 25)

            rating_history.append({
                "date": g.updated_at.strftime("%Y-%m-%d"),
                "rating": simulated_rating,
                "result": result,
            })

            # Daily results (for bar chart)
            day_key = g.updated_at.strftime("%Y-%m-%d")
            if day_key not in daily_buckets:
                daily_buckets[day_key] = {"wins": 0, "losses": 0, "draws": 0}
            if result == "win":
                daily_buckets[day_key]["wins"] += 1
            elif result == "loss":
                daily_buckets[day_key]["losses"] += 1
            else:
                daily_buckets[day_key]["draws"] += 1

        # Recent form: last 10, newest first
        recent_form = list(reversed(recent_results[-10:]))

        # Current streak (from most recent game)
        current_streak_type = "none"
        current_streak_count = 0
        if recent_form:
            current_streak_type = recent_form[0]
            current_streak_count = 0
            for r in recent_form:
                if r == current_streak_type:
                    current_streak_count += 1
                else:
                    break

        # Most played opponents (top 5)
        most_played = sorted(opponent_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        games_this_week = games.filter(updated_at__gte=week_ago).count()
        games_this_month = games.filter(updated_at__gte=month_ago).count()

        # Build sorted daily results
        daily_results = [
            {"date": d, **counts}
            for d, counts in sorted(daily_buckets.items())
        ]

        return Response({
            "total_games": total,
            "win_rate": round(wins / total * 100, 1) if total > 0 else 0,
            "games_this_week": games_this_week,
            "games_this_month": games_this_month,
            "white_wins": white_wins,
            "white_total": white_total,
            "black_wins": black_wins,
            "black_total": black_total,
            "ai_wins": ai_wins,
            "ai_total": ai_total,
            "human_wins": human_wins,
            "human_total": human_total,
            "avg_moves": round(total_moves / total, 1) if total > 0 else 0,
            "recent_form": recent_form,
            "most_played": [{"username": u, "games": c} for u, c in most_played],
            "longest_win_streak": longest_streak,
            "current_streak": {"type": current_streak_type, "count": current_streak_count},
            "rating_history": rating_history,
            "daily_results": daily_results,
        })
# ===========================================================================


# ===========================================================================
class UserListView(APIView):
    """Admin: list all users with search."""
    permission_classes      = [IsAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def get(self, request: Request, format=None):
        from django.db.models import Q

        search = request.query_params.get("search", "").strip()
        users = User.objects.all().order_by("-date_joined")
        users = users.exclude(username__startswith="stockfish_ai")

        if search:
            users = users.filter(
                Q(username__icontains=search) |
                Q(email__icontains=search) |
                Q(dispname__icontains=search)
            )

        users = users[:100]

        data = [
            {
                "id": u.pk,
                "username": u.username,
                "email": u.email,
                "dispname": u.dispname,
                "role": u.role,
                "is_active": u.is_active,
                "is_online": u.is_online,
                "rating": u.rating,
                "wins": u.wins,
                "loss": u.loss,
                "draw": u.draw,
                "date_joined": u.date_joined.isoformat(),
                "avatar": request.build_absolute_uri(u.avatar.url) if u.avatar else None,
            }
            for u in users
        ]

        return Response(data)
# ===========================================================================


# ===========================================================================
class UserUpdateView(APIView):
    """Admin: update user role, active status."""
    permission_classes      = [IsAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def patch(self, request: Request, user_id: int, format=None):
        from django.shortcuts import get_object_or_404

        target = get_object_or_404(User, pk=user_id)

        # Prevent modifying yourself
        if target.pk == request.user.pk:
            return Response({"error": "Cannot modify your own account."}, status=400)

        # Prevent modifying other admins
        if target.role == "admin" and target.pk != request.user.pk:
            return Response({"error": "Cannot modify other admins."}, status=403)

        role = request.data.get("role")
        is_active = request.data.get("is_active")

        if role is not None:
            if role not in ("user", "moderator", "admin"):
                return Response({"error": "Invalid role."}, status=400)
            target.role = role

        if is_active is not None:
            target.is_active = bool(is_active)

        target.save(update_fields=["role", "is_active", "updated_at"] if hasattr(target, "updated_at") else ["role", "is_active"])

        return Response({
            "id": target.pk,
            "username": target.username,
            "role": target.role,
            "is_active": target.is_active,
        })
# ===========================================================================


# ===========================================================================
class UserDeleteView(APIView):
    """Admin: delete a user."""
    permission_classes      = [IsAdmin]
    authentication_classes  = [JWTAuthentication, SessionAuthentication]

    def delete(self, request: Request, user_id: int, format=None):
        from django.shortcuts import get_object_or_404

        target = get_object_or_404(User, pk=user_id)

        if target.pk == request.user.pk:
            return Response({"error": "Cannot delete your own account."}, status=400)

        if target.role == "admin":
            return Response({"error": "Cannot delete other admins."}, status=403)

        username = target.username
        target.delete()

        return Response({"status": f"User '{username}' deleted."})
# ===========================================================================


# ===========================================================================
class AchievementsView(APIView):
    permission_classes      = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication, APIKeyAuthentication]

    def get(self, request: Request, username: str | None = None, format=None):
        from chess_game.models import Game, GameStatus
        from tournament.models import TournamentParticipant, Match, MatchStatus, Tournament, TournamentStatus
        from django.db.models import Q
        from django.shortcuts import get_object_or_404

        if username:
            target = get_object_or_404(User, username=username)
        else:
            target = cast(User, request.user)

        # Gather data
        games = Game.objects.filter(
            Q(player1=target) | Q(player2=target),
            status=GameStatus.FINISHED,
        ).select_related("winner")

        total_games = games.count()
        wins = games.filter(winner=target).count()

        tournament_count = TournamentParticipant.objects.filter(player=target).count()

        # Actually compute tournament wins properly
        # A tournament win = won the final match
        tournament_wins = 0
        for tp in TournamentParticipant.objects.filter(player=target).select_related("tournament"):
            t = tp.tournament
            if t.status != TournamentStatus.FINISHED:
                continue
            final_match = Match.objects.filter(tournament=t).order_by("-round_nb").first()
            if final_match and final_match.winner == target:
                tournament_wins += 1

        # Compute longest win streak
        longest_streak = 0
        current_streak = 0
        for g in games.order_by("created_at"):
            if g.winner == target:
                current_streak += 1
                longest_streak = max(longest_streak, current_streak)
            else:
                current_streak = 0

        # AI wins
        ai_wins = games.filter(winner=target, player2_is_ai=True).count()

        # Define achievements
        achievements = [
            {
                "id": "first_blood",
                "name": "First Blood",
                "description": "Win your first game",
                "icon": "⚔️",
                "unlocked": wins >= 1,
            },
            {
                "id": "veteran",
                "name": "Veteran",
                "description": "Win 10 games",
                "icon": "🎖️",
                "unlocked": wins >= 10,
                "progress": min(wins, 10),
                "target": 10,
            },
            {
                "id": "warrior",
                "name": "Warrior",
                "description": "Win 50 games",
                "icon": "⚔️",
                "unlocked": wins >= 50,
                "progress": min(wins, 50),
                "target": 50,
            },
            {
                "id": "played_10",
                "name": "Getting Started",
                "description": "Play 10 games",
                "icon": "🎮",
                "unlocked": total_games >= 10,
                "progress": min(total_games, 10),
                "target": 10,
            },
            {
                "id": "played_100",
                "name": "Dedicated",
                "description": "Play 100 games",
                "icon": "🏋️",
                "unlocked": total_games >= 100,
                "progress": min(total_games, 100),
                "target": 100,
            },
            {
                "id": "tournament_player",
                "name": "Contender",
                "description": "Join a tournament",
                "icon": "🏟️",
                "unlocked": tournament_count >= 1,
            },
            {
                "id": "tournament_champion",
                "name": "Champion",
                "description": "Win a tournament",
                "icon": "🏆",
                "unlocked": tournament_wins >= 1,
            },
            {
                "id": "rating_1300",
                "name": "Rising Star",
                "description": "Reach 1300 rating",
                "icon": "⭐",
                "unlocked": target.rating >= 1300,
            },
            {
                "id": "rating_1500",
                "name": "Expert",
                "description": "Reach 1500 rating",
                "icon": "💎",
                "unlocked": target.rating >= 1500,
            },
            {
                "id": "streak_5",
                "name": "On Fire",
                "description": "Win 5 games in a row",
                "icon": "🔥",
                "unlocked": longest_streak >= 5,
            },
            {
                "id": "streak_10",
                "name": "Unstoppable",
                "description": "Win 10 games in a row",
                "icon": "💪",
                "unlocked": longest_streak >= 10,
            },
            {
                "id": "ai_slayer",
                "name": "AI Slayer",
                "description": "Beat the AI",
                "icon": "🤖",
                "unlocked": ai_wins >= 1,
            },
        ]

        return Response({
            "achievements": achievements,
            "unlocked_count": sum(1 for a in achievements if a["unlocked"]),
            "total_count": len(achievements),
        })
# ===========================================================================

