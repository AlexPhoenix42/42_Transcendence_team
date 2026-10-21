# users/gdpr.py

from rest_framework.views                       import APIView
from rest_framework.response                    import Response
from rest_framework.request                     import Request
from rest_framework.permissions                 import IsAuthenticated
from rest_framework_simplejwt.authentication    import JWTAuthentication
from rest_framework.authentication              import SessionAuthentication

from django.http                                import JsonResponse
from django.contrib.auth                        import get_user_model
from django.db.models                           import Q

from local_auth.resets                          import create_reset_token, verify_reset_token
from django.core.mail                           import send_mail
from django.conf                                import settings

from users.api_key                              import APIKeyAuthentication

import logging

logger = logging.getLogger(__name__)

User = get_user_model()


class ExportDataView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication, APIKeyAuthentication]

    def get(self, request: Request) -> Response:
        user = request.user

        try:
            # Profile
            profile = {
                "username": user.username,
                "email": user.email,
                "display_name": user.dispname,
                "bio": user.bio,
                "rating": user.rating,
                "wins": user.wins,
                "losses": user.loss,
                "draws": user.draw,
                "date_joined": user.date_joined.isoformat(),
                "role": user.role,
            }

            # Friends
            friends = list(user.friends.values_list("username", flat=True))

            # Friend requests
            from friends.models import FriendRequest
            sent_requests = list(
                FriendRequest.objects.filter(from_user=user).values(
                    "to_user__username", "status", "created_at"
                )
            )
            received_requests = list(
                FriendRequest.objects.filter(to_user=user).values(
                    "from_user__username", "status", "created_at"
                )
            )

            # Chess games
            from chess_game.models import Game as ChessGame
            chess_games = list(
                ChessGame.objects.filter(Q(player1=user) | Q(player2=user)).values(
                    "id", "status", "result_reason", "player1__username",
                    "player2__username", "player1_color", "created_at", "updated_at",
                )
            )

            # Tournament participations
            from tournament.models import TournamentParticipant
            tournaments = list(
                TournamentParticipant.objects.filter(player=user)
                .select_related("tournament")
                .values("tournament__id", "tournament__name", "tournament__status", "joined_at")
            )

            # Goose games
            from goose_game.models import GoosePlayer
            goose_games = list(
                GoosePlayer.objects.filter(user=user)
                .select_related("game")
                .values("game__id", "game__name", "game__status")
            )

            # Pacman games
            from pacman_game.models import GamePlayer
            pacman_games = list(
                GamePlayer.objects.filter(user=user)
                .select_related("game")
                .values("game__id", "game__room_name", "game__status")
            )

            # Chat messages (DMs only — not global/game chat)
            from chat.models import Message, ChatRoom, RoomType
            dm_rooms = ChatRoom.objects.filter(room_type=RoomType.DM, members=user)
            messages = list(
                Message.objects.filter(room__in=dm_rooms, sender=user).values(
                    "content", "created_at", "room__id"
                )
            )

            # OAuth links
            from open_auth.models import OAuthLink
            oauth_links = list(
                OAuthLink.objects.filter(user=user).values("provider", "provider_unique_id")
            )

            # Achievements (computed from user stats)
            achievement_names = []
            if user.wins >= 1: achievement_names.append("First Blood")
            if user.wins >= 10: achievement_names.append("Veteran")
            if user.wins >= 50: achievement_names.append("Warrior")
            if user.rating >= 1300: achievement_names.append("Rising Star")
            if user.rating >= 1500: achievement_names.append("Expert")

            data = {
                "profile": profile,
                "friends": friends,
                "friend_requests_sent": sent_requests,
                "friend_requests_received": received_requests,
                "chess_games": chess_games,
                "tournaments": tournaments,
                "goose_games": goose_games,
                "pacman_games": pacman_games,
                "direct_messages": messages,
                "oauth_links": oauth_links,
                "achievements_unlocked": achievement_names,
            }

            response = JsonResponse(data, json_dumps_params={"indent": 2, "default": str})
            response["Content-Disposition"] = f'attachment; filename="{user.username}_data.json"'
            return response

        except Exception as e:
            logger.error("Data export failed for user %s: %s", user.username, e)
            return Response({"error": "Failed to export data."}, status=500)


class RequestDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        user = request.user

        try:
            plain_token = create_reset_token(user, "delete")

            base_url = settings.FRONTEND_URL
            delete_url = f"{base_url}/delete-account?token={plain_token}&uid={user.pk}"

            send_mail(
                "Account Deletion Request",
                f"Hello {user.username},\n\n"
                f"You requested to delete your account. This action is permanent "
                f"and cannot be undone.\n\n"
                f"The following data will be permanently deleted:\n"
                f"- Your profile and account information\n"
                f"- Your email address\n"
                f"- Your game history and statistics\n"
                f"- Your chat messages and friend list\n\n"
                f"Click the link below to confirm:\n"
                f"{delete_url}\n\n"
                f"This link will expire in 1 hour.\n"
                f"If you did not request this, please ignore this email.\n",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                fail_silently=False,
            )

            return Response({"status": "Confirmation email sent."})

        except Exception as e:
            logger.error("Delete request failed for user %s: %s", user.username, e)
            return Response({"error": "Failed to send confirmation email."}, status=500)


class ConfirmDeleteView(APIView):
    permission_classes = []

    def post(self, request: Request) -> Response:
        token = request.data.get("token")
        uid = request.data.get("uid")

        if not token or not uid:
            return Response({"error": "Token and uid required."}, status=400)

        try:
            user = User.objects.get(pk=uid)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=404)

        if not verify_reset_token(user, "delete", token):
            return Response({"error": "Invalid or expired token."}, status=400)

        username = user.username

        try:
            user.delete()
        except Exception as e:
            logger.error("Account deletion failed for user %s: %s", username, e)
            return Response({"error": "Failed to delete account."}, status=500)

        return Response({"status": f"Account '{username}' has been permanently deleted."})

