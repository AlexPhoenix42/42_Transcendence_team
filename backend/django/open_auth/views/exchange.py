# open_auth/views/exchange.py

from __future__                         import annotations
from typing                             import TYPE_CHECKING

from rest_framework.request             import Request
from rest_framework.views               import APIView
from rest_framework.response            import Response

from rest_framework.throttling          import AnonRateThrottle

from rest_framework_simplejwt.tokens    import RefreshToken

from two_factor_auth.models             import TOTPDevice

from django.core.cache                  import cache

from django.contrib.auth                import login

from django.conf                        import settings

from datetime                           import timedelta
from django.utils                       import timezone

if  TYPE_CHECKING:
    from users.models import User as User
else:
    from django.contrib.auth import get_user_model
    User = get_user_model()

class TokenExchangeView(APIView):
    permission_classes  = []
    throttle_classes    = [AnonRateThrottle]

    def post(self, request: Request) -> Response:
        login_token = request.data.get("login_token")
        if  not login_token:
            return  Response({"error": "login_token required"}, status=400)

        cache_key   = f"login_token:{login_token}"
        user_pk     = cache.get(cache_key)

        if  user_pk is None:
            return  Response(
                {"error": "Invalid or expired login token"}, status=400)

        cache.delete(cache_key)

        try:
            user: User = User.objects.get(pk=user_pk)
        except User.DoesNotExist:
            return  Response({"error": "User not found."}, status=400)

        # --- Account status check ---
        if  not user.is_active:
            return Response({"error": "Account is deactivated."}, status=403)

        if  not user.email_verfd:
            if  timezone.now() - user.date_joined > timedelta(days=3):
                return Response(
                    {"error": "Account frozen. Please verify your email"},
                    status=403,
                )

        # ----------------------------------------

        # 2FA check ---------------------------------------------------
        try:
            device = TOTPDevice.objects.get(user=user, is_active=True)  # type: ignore[attr-defined]
        except TOTPDevice.DoesNotExist:
            device = None
    
        if  device is not None:
            # Generate a temporary 2FA token
            import uuid
            tmp_token = str(uuid.uuid4())

            cache.set(
                f"2fa_tmp_token:{tmp_token}",
                user.pk,
                timeout=60,
            )

            return Response({
                "tmp_token"     : tmp_token,
                "requires_2fa"  : True,
            })
        # ---------------------------------------------------------------

        # Authenticate session for Websocket
        user.backend = 'django.contrib.auth.backends.ModelBackend'
        login(request, user)
        user.is_online = True
        user.save(update_fields=["is_online"])

        refresh = RefreshToken.for_user(user)

        response = Response({
            "access"    : str(refresh.access_token),
            "user"      : {
                "id"        : user.pk,
                "username"  : user.username,
                "email"     : user.email,
            }
        })

        # Set refresh token as httpOnly cookie
        is_production = not settings.DEBUG # True when deployed with DEBUG=False

        response.set_cookie(
            key="refresh_token",
            value=str(refresh),
            httponly=True,
            secure=is_production,
            samesite="Strict",
            # this is not needed even during testing, it works with 'Strict' as well.
            # this is only for testing during dev. 
            # check open_auth/views/refresh.py too
            #samesite="Lax",     
            max_age=60 * 60 * 24 * 7, # 7 days
        )

        return response

