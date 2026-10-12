# local_auth/resets.py

import secrets

from django.contrib.auth.hashers        import make_password, check_password
from django.core.mail                   import send_mail

from django.utils                       import timezone
from datetime                           import timedelta

from django.conf                        import settings

from .models                            import ResetToken

# ============================================================================
def create_reset_token(user, token_type: str) -> str:
    """
    Generate a random reset token, store its hash, and return the plain token.
    Overwrites any existing token of the same type for this user.
    """
    plain_token     = secrets.token_urlsafe(32)
    hashed          = make_password(plain_token)

    ResetToken.objects.update_or_create(
        user=user,
        token_type=token_type,
        defaults={"hashed_token": hashed},
    )

    return plain_token
# ============================================================================


# ============================================================================
def send_reset_email(user, plain_token: str, token_type: str):
    """
    Build the reset link for the given token type and send it via email.
    """
    base_url    = settings.FRONTEND_URL
    reset_url   = (
        f"{base_url}/reset"
        f"?token={plain_token}&uid={user.pk}&type={token_type}"
    )

    subject     = "Password Reset" if token_type == "password" else "2FA Reset"
    message     = (
        f"Hello {user.username},\n\n"
        f"You requested a {subject.lower()}. "
        f"Click the link below to proceed:\n"
        f"{reset_url}\n\n"
        f"This link will expire in 1 hour.\n"
        f"If you did not request this, please ignore this email.\n"
    )

    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
    )
# ============================================================================


# ============================================================================
def verify_reset_token(user, token_type: str, submitted_token: str) -> bool:
    """
    Validate the submitted reset token against the stored hash.
    Checks expiry (1 hour) and deletes the token on success.
    Returns True if valid, False otherwise.
    """
    try:
        stored = ResetToken.objects.get(user=user, token_type=token_type)
    except ResetToken.DoesNotExist:
        return False

    # Check expiry: 1 hour
    if  timezone.now() - stored.created_at > timedelta(hours=1):
        stored.delete()
        return False

    if  check_password(submitted_token, stored.hashed_token):
        stored.delete()
        return True

    return False
# ============================================================================

