# local/auth/verification.py

import  secrets

from django.contrib.auth.hashers    import make_password, check_password

from datetime                       import timedelta

from django.utils                   import timezone

from django.core.mail               import send_mail

from django.conf                    import settings

from .models                        import EmailVerificationToken


# =========================================================================
def create_verification_token(user) -> str:
    """
    Generate a random verification token, store its hash,
    and return the plain token.
    Overwrites any existing token for this user.
    """
    plain_token = secrets.token_urlsafe(32)
    hashed      = make_password(plain_token)

    EmailVerificationToken.objects.update_or_create(
        user=user,
        defaults={"hashed_token": hashed, "created_at": timezone.now()},
    )

    return plain_token
# =========================================================================


# =========================================================================
def send_verification_email(user, plain_token:str, request=None):
    """
    Build the verification link and send it via email.
    The email is captured by Mailpit in development.
    """
    #base_url    = settings.FRONTEND_URL
    base_url    = settings.BACKEND_URL
    verify_url  = f"{base_url}/api/verify-email/?token={plain_token}&uid={user.pk}"

    subject     = "Verify your email address"
    message     = (
        f"Hello {user.username},\n\n"
        f"Please click the link below to verify your email address:\n"
        f"{verify_url}\n\n"
        f"This link will expire in 3 days (initial) or 24 hours (re-sent).\n"
        f"If you did not register, please ignore this email.\n"
    )

    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
    )
# =========================================================================


# =========================================================================
def verify_token(user, token: str) -> bool:
    """
    Validate the provided token against the stored hash.
    If valid and not expired (3 days initial, 24h for re‑sent),
    mark the user as email_verified, delete the token, and return True.
    Otherwise return False.
    """
    try:
        stored = EmailVerificationToken.objects.get(user=user)
    except EmailVerificationToken.DoesNotExist:
        return False

    # Check expiry: 3 days for the first token, 24h if the user already had a frozen account?
    # We determine expiry by the user's state: if the account is already frozen,
    # the token is only valid 24h; othersize 3 days.
    if  not user.is_active and not user.email_verfd:
        # Account is frozen, token ust be used within 24h
        max_age = timedelta(hours=24)
    else:
        # Normal initial token, 3 days
        max_age = timedelta(days=3)

    if  timezone.now() - stored.created_at > max_age:
        stored.delete()     # expired token is useless
        return False

    if  check_password(token, stored.hashed_token):
        user.email_verfd    = True
        #user.save(update_fields=["email_verfd", "is_active"])
        user.save(update_fields=["email_verfd"])
        stored.delete()
        return True

    return False
# =========================================================================

