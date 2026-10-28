# users/gdpr.py

from rest_framework.views                       import APIView
from rest_framework.response                    import Response
from rest_framework.request                     import Request
from rest_framework.permissions                 import IsAuthenticated
from rest_framework_simplejwt.authentication    import JWTAuthentication
from rest_framework.authentication              import SessionAuthentication

from django.http                                import JsonResponse, HttpResponse
from django.contrib.auth                        import get_user_model
from django.db.models                           import Q

from local_auth.resets                          import create_reset_token, verify_reset_token
from django.core.mail                           import send_mail
from django.conf                                import settings

from users.api_key                              import APIKeyAuthentication

from xml.etree.ElementTree                      import Element, SubElement, tostring

import csv
import io

import logging

logger = logging.getLogger(__name__)

User = get_user_model()


class ExportDataView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes  = [JWTAuthentication, SessionAuthentication, APIKeyAuthentication]

    def _collect_data(self, user):
        """Collect all user data into a dict."""
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

        friends = list(user.friends.values_list("username", flat=True))

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

        from chess_game.models import Game as ChessGame
        chess_games = list(
            ChessGame.objects.filter(Q(player1=user) | Q(player2=user)).values(
                "id", "status", "result_reason", "player1__username",
                "player2__username", "player1_color", "created_at", "updated_at",
            )
        )

        from tournament.models import TournamentParticipant
        tournaments = list(
            TournamentParticipant.objects.filter(player=user)
            .select_related("tournament")
            .values("tournament__id", "tournament__name", "tournament__status", "joined_at")
        )

        from goose_game.models import GoosePlayer
        goose_games = list(
            GoosePlayer.objects.filter(user=user)
            .select_related("game")
            .values("game__id", "game__name", "game__status")
        )

        from pacman_game.models import GamePlayer
        pacman_games = list(
            GamePlayer.objects.filter(user=user)
            .select_related("game")
            .values("game__id", "game__room_name", "game__status")
        )

        from chat.models import Message, ChatRoom, RoomType
        dm_rooms = ChatRoom.objects.filter(room_type=RoomType.DM, members=user)
        messages = list(
            Message.objects.filter(room__in=dm_rooms, sender=user).values(
                "content", "created_at", "room__id"
            )
        )

        from open_auth.models import OAuthLink
        oauth_links = list(
            OAuthLink.objects.filter(user=user).values("provider", "provider_unique_id")
        )

        achievement_names = []
        if user.wins >= 1: achievement_names.append("First Blood")
        if user.wins >= 10: achievement_names.append("Veteran")
        if user.wins >= 50: achievement_names.append("Warrior")
        if user.rating >= 1300: achievement_names.append("Rising Star")
        if user.rating >= 1500: achievement_names.append("Expert")

        return {
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

    def _to_csv(self, data, username):
        """Convert data dict to CSV with one section per data type."""
        output = io.StringIO()
        writer = csv.writer(output)

        # Profile
        writer.writerow(["=== Profile ==="])
        for key, val in data["profile"].items():
            writer.writerow([key, str(val)])
        writer.writerow([])

        # Friends
        writer.writerow(["=== Friends ==="])
        writer.writerow(["username"])
        for f in data["friends"]:
            writer.writerow([f])
        writer.writerow([])

        # Chess games
        if data["chess_games"]:
            writer.writerow(["=== Chess Games ==="])
            headers = list(data["chess_games"][0].keys())
            writer.writerow(headers)
            for game in data["chess_games"]:
                writer.writerow([str(game.get(h, "")) for h in headers])
            writer.writerow([])

        # Tournaments
        if data["tournaments"]:
            writer.writerow(["=== Tournaments ==="])
            headers = list(data["tournaments"][0].keys())
            writer.writerow(headers)
            for t in data["tournaments"]:
                writer.writerow([str(t.get(h, "")) for h in headers])
            writer.writerow([])

        # Goose games
        if data["goose_games"]:
            writer.writerow(["=== Goose Games ==="])
            headers = list(data["goose_games"][0].keys())
            writer.writerow(headers)
            for g in data["goose_games"]:
                writer.writerow([str(g.get(h, "")) for h in headers])
            writer.writerow([])

        # Pacman games
        if data["pacman_games"]:
            writer.writerow(["=== Pacman Games ==="])
            headers = list(data["pacman_games"][0].keys())
            writer.writerow(headers)
            for g in data["pacman_games"]:
                writer.writerow([str(g.get(h, "")) for h in headers])
            writer.writerow([])

        # Messages
        if data["direct_messages"]:
            writer.writerow(["=== Direct Messages ==="])
            headers = list(data["direct_messages"][0].keys())
            writer.writerow(headers)
            for m in data["direct_messages"]:
                writer.writerow([str(m.get(h, "")) for h in headers])
            writer.writerow([])

        # Achievements
        writer.writerow(["=== Achievements ==="])
        writer.writerow(["achievement"])
        for a in data["achievements_unlocked"]:
            writer.writerow([a])

        return output.getvalue()

    def _to_xml(self, data, username):
        """Convert data dict to XML."""
        root = Element("user_data")
        root.set("username", username)

        def add_dict(parent, tag, d):
            el = SubElement(parent, tag)
            for k, v in d.items():
                child = SubElement(el, k.replace("__", "_"))
                child.text = str(v) if v is not None else ""
            return el

        def add_list_of_dicts(parent, tag, item_tag, items):
            el = SubElement(parent, tag)
            for item in items:
                add_dict(el, item_tag, item)
            return el

        # Profile
        add_dict(root, "profile", data["profile"])

        # Friends
        friends_el = SubElement(root, "friends")
        for f in data["friends"]:
            child = SubElement(friends_el, "friend")
            child.text = f

        # Lists of dicts
        add_list_of_dicts(root, "chess_games", "game", data["chess_games"])
        add_list_of_dicts(root, "tournaments", "tournament", data["tournaments"])
        add_list_of_dicts(root, "goose_games", "game", data["goose_games"])
        add_list_of_dicts(root, "pacman_games", "game", data["pacman_games"])
        add_list_of_dicts(root, "direct_messages", "message", data["direct_messages"])
        add_list_of_dicts(root, "friend_requests_sent", "request", data["friend_requests_sent"])
        add_list_of_dicts(root, "friend_requests_received", "request", data["friend_requests_received"])
        add_list_of_dicts(root, "oauth_links", "link", data["oauth_links"])

        # Achievements
        ach_el = SubElement(root, "achievements")
        for a in data["achievements_unlocked"]:
            child = SubElement(ach_el, "achievement")
            child.text = a

        return '<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(root, encoding="unicode")

    def get(self, request: Request) -> Response:
        user = request.user
        fmt = request.query_params.get("export_format", "json").lower()

        if fmt not in ("json", "csv", "xml"):
            return Response({"error": "Supported formats: json, csv, xml"}, status=400)

        try:
            data = self._collect_data(user)

            if fmt == "csv":
                content = self._to_csv(data, user.username)
                response = HttpResponse(content, content_type="text/csv")
                response["Content-Disposition"] = f'attachment; filename="{user.username}_data.csv"'
                return response

            if fmt == "xml":
                content = self._to_xml(data, user.username)
                response = HttpResponse(content, content_type="application/xml")
                response["Content-Disposition"] = f'attachment; filename="{user.username}_data.xml"'
                return response

            # Default: JSON
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

        response = Response({"status": f"Account '{username}' has been permanently deleted."})
        response.delete_cookie("refresh_token", path="/", samesite="Strict")
        return response

class ImportDataView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication, SessionAuthentication, APIKeyAuthentication]

    ALLOWED_PROFILE_FIELDS = {"display_name", "bio"}

    def post(self, request: Request) -> Response:
        user = request.user

        # Accept JSON file upload or raw JSON body
        uploaded = request.FILES.get("file")
        if uploaded:
            if uploaded.size > 10 * 1024 * 1024:
                return Response({"error": "File too large (max 10MB)."}, status=400)
            try:
                raw = uploaded.read().decode("utf-8")
                data = json.loads(raw)
            except (UnicodeDecodeError, json.JSONDecodeError):
                return Response({"error": "Invalid JSON file."}, status=400)
        else:
            data = request.data
            if not isinstance(data, dict):
                return Response({"error": "Expected a JSON object."}, status=400)

        results = {"updated": [], "skipped": [], "errors": []}

        try:
            # Import profile fields (only safe ones)
            profile = data.get("profile")
            if profile and isinstance(profile, dict):
                for field in self.ALLOWED_PROFILE_FIELDS:
                    if field in profile:
                        val = str(profile[field])[:500]  # cap length
                        if field == "display_name":
                            if len(val) > 50:
                                results["errors"].append(f"display_name too long (max 50)")
                                continue
                            user.dispname = val
                            results["updated"].append("display_name")
                        elif field == "bio":
                            user.bio = val
                            results["updated"].append("bio")

                # Skip unsafe fields
                unsafe = set(profile.keys()) - self.ALLOWED_PROFILE_FIELDS
                for f in unsafe:
                    results["skipped"].append(f"profile.{f} (read-only)")

            # Bulk import friends
            friends_list = data.get("friends")
            if friends_list and isinstance(friends_list, list):
                from friends.models import FriendRequest
                added = 0
                for username in friends_list:
                    if not isinstance(username, str):
                        continue
                    try:
                        target = User.objects.get(username=username)
                        if target == user:
                            continue
                        if user.friends.filter(pk=target.pk).exists():
                            continue
                        # Create accepted friend request
                        FriendRequest.objects.get_or_create(
                            from_user=user, to_user=target,
                            defaults={"status": "accepted"}
                        )
                        user.friends.add(target)
                        added += 1
                    except User.DoesNotExist:
                        results["errors"].append(f"User '{username}' not found")
                if added:
                    results["updated"].append(f"friends ({added} added)")

            user.save()

            return Response({
                "status": "Import completed.",
                "updated": results["updated"],
                "skipped": results["skipped"],
                "errors": results["errors"],
            })

        except Exception as e:
            logger.error("Data import failed for user %s: %s", user.username, e)
            return Response({"error": "Import failed."}, status=500)

