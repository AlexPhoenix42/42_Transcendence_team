# open_auth/views/refresh.py

from rest_framework.views               import APIView
from rest_framework.response            import Response
from rest_framework.request             import Request
from rest_framework_simplejwt.tokens    import RefreshToken

from django.contrib.auth                import get_user_model

from django.conf                        import settings

User = get_user_model()

class TokenRefreshView(APIView):
    permission_classes = []

    def post(self, request: Request) -> Response:
        # CSRF protection: require custom header
        if  request.headers.get("X-Requested-With") != "XMLHttpRequest":
            return  Response({"error": "Missing required header."}, status=400)

        refresh_token = request.COOKIES.get("refresh_token")
        if  not refresh_token:
            return Response({"error": "No refresh token."}, status=401)

        # Validate and rotate the token
        try:
            old_token = RefreshToken(refresh_token) # type: ignore[arg-type]  # runtime accepts str
        except Exception:
            return Response({"error": "Invalid or expired refresh token."}, status=401)

        # Blacklist the old token (rotation: one-time use)
        old_token.blacklist()

        user_id     = old_token.payload.get("user_id")
        if  user_id is None:
            return Response({"error": "Invalid token payload"}, status=401)
        try:
            user        = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            resp = Response({"error": "User not found."}, status=401)
            resp.delete_cookie("refresh_token")
            return resp

        # Check if the user is still active
        if  not user.is_active:
            return Response({"error": "Account is deactivated."}, status=400)

        new_token   = RefreshToken.for_user(user)

        # Build response with new access token
        response    = Response({
            "access": str(new_token.access_token),
        })

        # Set the new refresh token as httpOnly cookie
        is_production = not settings.DEBUG
        response.set_cookie(
            key="refresh_token",
            value=str(new_token),
            httponly=True,
            secure=is_production,
            samesite="Strict",
            max_age=60 * 60 * 24 * 7,
        )

        return response

