# audit/signals.py
#
# Django fires these signals from the authentication backend.
# We hook into them to log login success/failure without touching the auth views.

from django.contrib.auth.signals    import user_logged_in, user_login_failed
from django.dispatch                import receiver

from .utils                         import log_event, check_and_lock


@receiver(user_logged_in)
def on_login_success(sender, request, user, **kwargs):
    log_event("login_success", request, user=user)


@receiver(user_login_failed)
def on_login_failed(sender, credentials, request, **kwargs):
    """
    `credentials` contains the username (or email) that was tried.
    `request` may be None in edge cases (management commands), so guard it.
    """
    if  request is None:
        return

    username = credentials.get("username", "")
    log_event(
        "login_failed",
        request,
        username=username,
        success=False,
    )

    # check if we should lock the account
    check_and_lock(username, request)

