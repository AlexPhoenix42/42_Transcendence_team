# local_auth/views.py

from rest_framework.response        import Response
from rest_framework.generics        import CreateAPIView, RetrieveUpdateAPIView
from rest_framework.permissions     import AllowAny, IsAuthenticated
from rest_framework.throttling      import AnonRateThrottle

from rest_framework.views           import APIView
from rest_framework_simplejwt.views import TokenObtainPairView as BaseTokenObtainPairView

from rest_framework                 import status

from django.contrib.auth                        import get_user_model
from django.contrib.auth.password_validation    import validate_password

from django.core.exceptions         import ValidationError

from django.shortcuts               import redirect, get_object_or_404

from .serializers                   import RegisterSerializer, ProfileUpdateSerializer

from .two_factor_serializer         import TwoFactorTokenObtainPairSerializer

from .verification                  import (
    create_verification_token, send_verification_email, verify_token
)

from .resets                        import (
    create_reset_token, send_reset_email, verify_reset_token
)

from two_factor_auth.models         import TOTPDevice

from django.conf                    import settings

from typing                         import TYPE_CHECKING

if  TYPE_CHECKING:
    from users.models import User as User
else:
    from django.contrib.auth import get_user_model
    User = get_user_model()


# ===========================================================================
class ThrottledTokenObtainPairView(BaseTokenObtainPairView):
    throttle_classes = [AnonRateThrottle]
    serializer_class = TwoFactorTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        # ── account lockout check ─────────────────────────────
        from django.utils import timezone as tz
        _uname = request.data.get("username", "")
        if  _uname:
            from django.contrib.auth import get_user_model
            _U = get_user_model()
            try:
                _target = _U.objects.get(username=_uname)
                if  _target.locked_until and _target.locked_until > tz.now():
                    from rest_framework.response import Response
                    from rest_framework import status
                    return Response(
                        {"detail": "Account temporarily locked. Try again later."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
            except _U.DoesNotExist:
                pass
        # ──────────────────────────────────────────────────────

        resp = super().post(request, *args, **kwargs)

        # If 2FA is required, dont touch cookies, just pass through
        if  resp.data.get("requires_2fa"):
            return resp

        # Move refresh token from body to httpOnly cookie
        refresh_token   = resp.data.pop("refresh", None)
        if  refresh_token:
            is_dep = not settings.DEBUG
            resp.set_cookie(
                key="refresh_token",
                value=str(refresh_token),
                httponly=True,
                secure=is_dep,
                samesite="Strict",
                max_age=60 * 60 * 24 * 7,
            )

        return resp
# ===========================================================================


# ===========================================================================
class RegisterView(CreateAPIView):
    serializer_class        = RegisterSerializer
    permission_classes      = [AllowAny]
    throttle_classes        = [AnonRateThrottle]

    #def get(self, request):
    #    raise MethodNotAllowed("GET")

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)

        if serializer.is_valid():
            user = serializer.save()

            # --- Send verification email ---
            token   = create_verification_token(user)
            send_verification_email(user, token, request=request)
            # -------------------------------

            return  Response(
                {
                    "id":       user.pk,
                    "username": user.username,
                },
                status=status.HTTP_201_CREATED
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
# ===========================================================================


# ===========================================================================
class VerifyEmailView(APIView):
    permission_classes  = [AllowAny]
    throttle_classes    = [AnonRateThrottle]    # prevent abuse

    def get(self, request):
        token   = request.GET.get("token")
        uid     = request.GET.get("uid")

        if  not token or not uid:
            return redirect(
                f"{settings.FRONTEND_URL}"
                f"?status=verify_error"
                f"&reason=missing_params"
            )
        
        try:
            user = User.objects.get(pk=uid)
        except User.DoesNotExist:
            return redirect(
                f"{settings.FRONTEND_URL}"
                f"?status=verify_error"
                f"&reason=invalid_user"
            )

        if  verify_token(user, token):
            return redirect(f"{settings.FRONTEND_URL}?status=verified")
        else:
            return redirect(
                f"{settings.FRONTEND_URL}"
                f"?status=verify_error"
                f"&reason=invalid_or_expired"
            )
# ===========================================================================


# ===========================================================================
class ResendVerificationView(APIView):
    permission_classes  = [AllowAny]
    throttle_classes    = [AnonRateThrottle]

    def post(self, request):
        email = request.data.get("email")
        if  not email:
            return Response({"error": "Email required."}, status=400)

        try:
            user = User.objects.get(email=email, email_verfd=False)
        except User.DoesNotExist:
            return Response(
                {"status": "If the email is registered and not verified, a new link has been sent."}
            )
        
        token = create_verification_token(user)
        send_verification_email(user, token, request=request)

        return Response(
            {"status": "If the email is registered and not verified, a new link has been sent."}
        )

# ===========================================================================


# ===========================================================================
class ProfileUpdateView(RetrieveUpdateAPIView):
    serializer_class    = ProfileUpdateSerializer
    permission_classes  = [IsAuthenticated]

    def get_object(self):
        return self.request.user
# ===========================================================================


# ===========================================================================
class PasswordResetRequestView(APIView):
    permission_classes  = [AllowAny]
    throttle_classes    = [AnonRateThrottle]

    def post(self, request):
        email   = request.data.get("email")
        if  not email:
            return Response({"error": "Email required"}, status=400)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {"status": "If the email is registered, a reset link has been sent."}
            )

        token   = create_reset_token(user, "password")
        send_reset_email(user, token, "password")

        return Response(
            {"status": "If the email is registered, a reset link has been sent."}
        )
# ===========================================================================


# ===========================================================================
class PasswordResetRequestConfirmView(APIView):
    permission_classes  = [AllowAny]
    throttle_classes    = [AnonRateThrottle]

    def post(self, request):
        token           = request.data.get("token")
        uid             = request.data.get("uid")
        new_password    = request.data.get("new_password")

        if  not token or not uid or not new_password:
            return Response(
                {"error": "token, uid, and new password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user    = User.objects.get(pk=uid)
        except User.DoesNotExist:
            return Response(
                {"error": "Invalid or expired token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if  not verify_reset_token(user, "password", token):
            return Response(
                {"error": "Invalid or expired token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate password strength
        try:
            validate_password(new_password, user=user)
        except ValidationError as e:
            return Response(
                {"error": "Invalid password.", "details": e.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Apply the new password
        user.set_password(new_password)
        user.save(update_fields=["password"])

        # ── audit log ──
        from audit.utils import log_event
        log_event("password_reset", request, user=user)
        # ────────────────

        return Response({"status": "Password has been reset."})
# ===========================================================================


# ===========================================================================
class TwoFactorResetRequestView(APIView):
    permission_classes  = [AllowAny]
    throttle_classes    = [AnonRateThrottle]

    def post(self, request):
        email = request.data.get("email")
        if  not email:
            return Response({"error": "Email required"}, status=400)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {"status": "If the email is registered, a reset link has been sent."}
            )

        token = create_reset_token(user, "2fa")
        send_reset_email(user, token, "2fa")

        return Response(
            {"status": "If the email is registered, a reset link has been sent."}
        )
# ===========================================================================


# ===========================================================================
class TwoFactorResetConfirmView(APIView):
    permission_classes      = [AllowAny]
    throttle_classes        = [AnonRateThrottle]

    def post(self, request):
        token   = request.data.get("token")
        uid     = request.data.get("uid")

        if  not token or not uid:
            return Response({"error": "token and uid are required"}, status=400)

        try:
            user = User.objects.get(pk=uid)
        except User.DoesNotExist:
            return Response({"error": "Invalid or expired token"}, status=400)

        if  not verify_reset_token(user, "2fa", token):
            return Response({"error": "Invalid or expired token"}, status=400)

        # Disable 2FA for this user
        TOTPDevice.objects.filter(user=user).delete()

        return Response({"status": "2FA has been reset"})
# ===========================================================================


# ===========================================================================
class PublicProfileView(APIView):
    permission_classes  = [IsAuthenticated]
    throttle_classes    = [AnonRateThrottle]

    def get(self, request, username):
        user = get_object_or_404(User, username=username)
        data = {
            "id"            : user.pk,
            "username"      : user.username,
            "dispname"      : user.get_display_name(),
            "bio"           : user.bio,
            "avatar"        : request.build_absolute_uri(user.avatar.url) if user.avatar else None,
            "rating"        : user.rating,
            "wins"          : user.wins,
            "loss"          : user.loss,
            "draw"          : user.draw,
            "is_online"     : user.is_online,
            "friends_cnt"   : user.friends.count(),
            "role"          : user.role,
        }
        return Response(data)
# ===========================================================================

