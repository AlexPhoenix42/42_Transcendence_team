# two_factor_auth/views

from typing import TYPE_CHECKING

from rest_framework.views               import APIView
from rest_framework.response            import Response
from rest_framework.request             import Request
from rest_framework.permissions         import IsAuthenticated, AllowAny
from rest_framework.exceptions          import NotFound

from rest_framework.throttling          import AnonRateThrottle

from rest_framework_simplejwt.tokens    import RefreshToken

from django.contrib.auth                import authenticate, login

from django.db                          import IntegrityError
from django.core.cache                  import cache
from django.conf                        import settings

from datetime                           import timedelta
from django.utils                       import timezone

from .models                            import TOTPDevice

from .utils import (
    generate_recovery_codes, generate_totp_secret, encrypt_secret, 
    get_provisioning_uri, decrypt_secret, verify_totp_code)

if  TYPE_CHECKING:
    from users.models import User as User
else:
    from django.contrib.auth import get_user_model
    User = get_user_model()

# ===========================================================================
class Enable2FAView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        user = request.user

        # Block if an active device already exists
        if TOTPDevice.objects.filter(user=user, is_active=True).exists():   # type: ignore[attr-defined, misc]
            return Response({"error": "A 2FA device is already configured."}, status=409)

        # Clean up any abandoned inactive device from a previous failed setup
        TOTPDevice.objects.filter(user=user, is_active=False).delete()   # type: ignore[attr-defined, misc]

        # Generate a new secret
        plain_secret    = generate_totp_secret()
        encrypted       = encrypt_secret(plain_secret)

        # Create the device (inactive)
        try:
            TOTPDevice.objects.create(  # type: ignore[attr-defined, misc]
                user=user,
                encrypted_secret=encrypted,
                is_active=False,
            ) 
        except IntegrityError:
            # Race condition: another request just created one
            return Response({"error": "A 2FA device is already configured."}, status=409)

        # Build the provisioning URI
        uri = get_provisioning_uri(user, plain_secret)

        # Show only once; frontend can display or encode as QR.
        return  Response({
            "provisioning_uri"  : uri,
            "secret"            : plain_secret,
        })
# ===========================================================================


# ===========================================================================
class Disable2FAView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        password    = request.data.get("password")
        code        = request.data.get("code")

        if  code:
            # Confirm by TOTP code (for OAuth-only users or anyone)
            try:
                device      = TOTPDevice.objects.get(user=request.user, is_active=True) # type: ignore[attr-defined, misc]
                plain_sec   = decrypt_secret(device.encrypted_secret) # type: ignore[arg-type] # BinaryField returns bytes

                if  not verify_totp_code(plain_sec, code):
                        return Response({"error": "Invalid TOTP code"}, status=400)
            except TOTPDevice.DoesNotExist:
                return Response({"error": "2FA is not enabled."}, status=400)
        
        elif password:
            # Confirm by password (traditional method)
            user = authenticate(username=request.user.username, password=password)  # type: ignore[attr-defined]

            if  user is None:
                return Response({"error": "Invalid password."}, status=400)

        else:
            return Response({"error": "Either password or 2FA code required."}, status=400)

        TOTPDevice.objects.filter(user=request.user).delete()   # type: ignore[attr-defined, misc]

        return Response({"status": "2fa disabled"})
# ===========================================================================


# ===========================================================================
class Status2FAView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        has_2fa = TOTPDevice.objects.filter(user=request.user, is_active=True).exists()
        return Response({"has_2fa": has_2fa})
# ===========================================================================


# Adding 2FA recovery mode
# ===========================================================================
class ConfirmEnable2FAView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        user = request.user
        code = request.data.get("code")

        if  not code:
            return Response({"error": "TOTP code required."}, status=400)
    
        try:
            device = TOTPDevice.objects.get(user=user, is_active=False) # type: ignore[attr-defined, misc]
        except TOTPDevice.DoesNotExist:
            raise NotFound("No pending 2FA setup found.")

        plain_secret = decrypt_secret(device.encrypted_secret)  # type: ignore[arg-type] # BinaryField returns bytes

        if  not verify_totp_code(plain_secret, code):
            return Response({"error": "Invalid TOTP code"}, status=400)

        # Activate the device
        device.is_active = True
        device.save(update_fields=["is_active"])

        # Generate recovery codes and return them once
        recovery_codes = generate_recovery_codes(device)

        return Response({
            "status"            : "2fa enabled",
            "recovery_codes"    : recovery_codes,
        })
# ===========================================================================


# ===========================================================================
class Verify2FAView(APIView):
    permission_classes  = [AllowAny]
    throttle_classes    = [AnonRateThrottle]

    def post(self, request: Request) -> Response:
        tmp_token   = request.data.get("tmp_token")
        code        = request.data.get("code")

        if  not tmp_token or not code:
            return Response({"error": "tmp_token and code are required."}, status=400)

        cache_key   = f"2fa_tmp_token:{tmp_token}"
        user_pk     = cache.get(cache_key)

        if  user_pk is None:
            return Response({"error": "Invalid or expired temporary token."}, status=400)

        # Load the user
        try:
            user: User = User.objects.get(pk=user_pk)
        except User.DoesNotExist:
            return Response({"error": "user not found."}, status=400)

        # --- Account status check ---
        if  not user.is_active:
            return Response({"error": "Account is deactivated."}, status=403)

        if  not user.email_verfd:
            if  timezone.now() - user.date_joined > timedelta(days=3):
                return Response(
                    {"error": "Account frozen. Please verify your email."},
                    status=403,
                )
        # ----------------------------

        # Get the active TOTP device and verify the code
        try:
            device = TOTPDevice.objects.get(user=user, is_active=True)  # type: ignore[attr-defined]
        except TOTPDevice.DoesNotExist:
            return Response({"error": "2FA is not enabled for this user."}, status=400)

        plain_secret    = decrypt_secret(device.encrypted_secret)  # type: ignore[arg-type] # BinaryField returns bytes

        code_ok         = verify_totp_code(plain_secret, code)

        if  not code_ok:
            # Fallback: check recovery codes
            from .utils import verify_recovery_code
            if  verify_recovery_code(device, code):
                code_ok = True

        if  not code_ok:
            return Response({"error": "Invalid TOTP code"}, status=400)

        # Consume the token immediately (single-use)
        cache.delete(cache_key)

        # Authenticate session for Websocket
        user.backend = 'django.contrib.auth.backends.ModelBackend'
        login(request, user)
        user.is_online = True
        user.save(update_fields=["is_online"])

        # Issue final JWT tokens
        refresh     = RefreshToken.for_user(user)

        resp        = Response({
            "access"     : str(refresh.access_token),
            "user"      : {
                "id"        : user.pk,
                "username"  : user.username,
                "email"     : user.email,
            }
        })

        # Set refresh token as httpOnly cookie (same as exchange endpoint)
        is_production   = not settings.DEBUG

        resp.set_cookie(
            key="refresh_token",
            value=str(refresh),
            httponly=True,
            secure=is_production,
            samesite="Strict",
            max_age=60 * 60 * 24 * 7,
        )

        return resp
# ===========================================================================

