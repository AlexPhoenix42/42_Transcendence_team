# open_auth/views/logout.py

from rest_framework.views               import APIView
from rest_framework.response            import Response
from rest_framework.request             import Request

from rest_framework.throttling          import AnonRateThrottle

from rest_framework_simplejwt.tokens    import RefreshToken

from django.contrib.auth                import logout

from asgiref.sync                       import async_to_sync
from channels.layers                    import get_channel_layer

import logging

logger = logging.getLogger(__name__)


class LogoutView(APIView):
    permission_classes  = []
    throttle_classes    = [AnonRateThrottle]

    def post(self, request: Request) -> Response:
        refresh_token = request.COOKIES.get("refresh_token")

        user_id = None
        if  refresh_token:
            try:
                token = RefreshToken(refresh_token) # type: ignore[arg-type]
                token.blacklist()
                user_id = token.get("user_id")
            except Exception:
                pass    # token already invalid, still clear the cookie

        if  user_id:
            channel_layer = get_channel_layer()
            if  channel_layer:
                try:
                    async_to_sync(channel_layer.group_send)(
                        f"user_{user_id}",
                        {"type": "force_disconnect"},
                    )
                except Exception:
                    logger.exception("Failed to send force_disconnect for user %s", user_id)

        if  request.user.is_authenticated:
            request.user.is_online = False
            request.user.save(update_fields=["is_online"])

        # Flush the Django session (destroys server-side data + invalidates sessionid)
        logout(request)

        resp = Response({"status": "logged out"})
        resp.delete_cookie("refresh_token", path="/", samesite="Strict")
        resp.delete_cookie("sessionid", path="/", samesite="Lax")

        return resp

