# audit/utils.py
#
# Helpers for logging security events and enforcing account lockout.
# Called by signals.py (for login/logout) and directly by views
# that have no Django signal (2FA toggle, password reset).

from datetime               import timedelta

from django.utils           import timezone
from django.contrib.auth    import get_user_model

User = get_user_model()

# ── configuration ──────────────────────────────────────────────────
MAX_FAILED_ATTEMPTS     = 5             # lock after N failures
LOCKOUT_WINDOW_MINUTES  = 15            # count failures in last N minutes
LOCKOUT_DURATION_MINUTES = 30           # lock account for N minutes
# ───────────────────────────────────────────────────────────────────


def get_client_ip(request):
    """
    Extract the real client IP.
    X-Forwarded-For is set by nginx / reverse proxy.
    Falls back to REMOTE_ADDR for direct connections.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if  forwarded:
        # first IP in the chain is the original client
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def get_user_agent(request):
    return request.META.get("HTTP_USER_AGENT", "")


def log_event(event_type, request, user=None, username="", success=True, metadata=None):
    """
    Create an AuditLog entry. Import here to avoid circular imports at module level.
    """
    from audit.models import AuditLog

    if  user and not username:
        username = user.username

    AuditLog.objects.create(
        event_type  = event_type,
        user        = user,
        username    = username,
        ip_address  = get_client_ip(request),
        user_agent  = get_user_agent(request),
        success     = success,
        metadata    = metadata or {},
    )


def check_and_lock(username, request):
    """
    Count recent failed logins for `username`.
    If threshold is reached, lock the account and log the event.
    Returns True if the account was just locked, False otherwise.
    """
    from audit.models import AuditLog

    window_start = timezone.now() - timedelta(minutes=LOCKOUT_WINDOW_MINUTES)

    recent_failures = AuditLog.objects.filter(
        username    = username,
        event_type  = "login_failed",
        timestamp__gte = window_start,
    ).count()

    if  recent_failures >= MAX_FAILED_ATTEMPTS:
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return False

        user.locked_until = timezone.now() + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        user.save(update_fields=["locked_until"])

        log_event(
            "account_locked",
            request,
            user=user,
            success=True,
            metadata={
                "reason":           f"{recent_failures} failed attempts in {LOCKOUT_WINDOW_MINUTES} min",
                "locked_until":     user.locked_until.isoformat(),
            },
        )
        return True

    return False

