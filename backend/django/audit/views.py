# audit/views.py

from rest_framework.views       import APIView
from rest_framework.response    import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework             import status

from django.utils               import timezone
from django.contrib.auth        import get_user_model

from datetime                   import timedelta

from .models                    import AuditLog

User = get_user_model()

# page size for audit log listing
PAGE_SIZE = 50


class IsAdminOrModerator(IsAuthenticated):
    """Only allow admin or moderator roles."""

    def has_permission(self, request, view):
        if  not super().has_permission(request, view):
            return False
        return request.user.role in ("admin", "moderator") or request.user.is_staff


# ===========================================================================
class AuditLogListView(APIView):
    """
    GET /api/audit/logs/
    Returns paginated audit logs with optional filters.

    Query params:
        event_type  — filter by event type (e.g. "login_failed")
        username    — filter by username (exact match)
        from_date   — ISO date, include events from this date
        to_date     — ISO date, include events up to this date
        page        — page number (default 1)
    """
    permission_classes = [IsAdminOrModerator]

    def get(self, request):
        qs = AuditLog.objects.all()

        # ── filters ───────────────────────────────────────────
        event_type = request.query_params.get("event_type")
        if  event_type:
            qs = qs.filter(event_type=event_type)

        username = request.query_params.get("username")
        if  username:
            qs = qs.filter(username=username)

        from_date = request.query_params.get("from_date")
        if  from_date:
            qs = qs.filter(timestamp__date__gte=from_date)

        to_date = request.query_params.get("to_date")
        if  to_date:
            qs = qs.filter(timestamp__date__lte=to_date)

        # ── pagination ────────────────────────────────────────
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (ValueError, TypeError):
            page = 1

        total   = qs.count()
        start   = (page - 1) * PAGE_SIZE
        logs    = qs[start : start + PAGE_SIZE]

        data = [
            {
                "id":           log.id,
                "event_type":   log.event_type,
                "username":     log.username,
                "ip_address":   log.ip_address,
                "user_agent":   log.user_agent,
                "success":      log.success,
                "metadata":     log.metadata,
                "timestamp":    log.timestamp.isoformat(),
            }
            for log in logs
        ]

        return Response({
            "results":      data,
            "total":        total,
            "page":         page,
            "page_size":    PAGE_SIZE,
            "total_pages":  (total + PAGE_SIZE - 1) // PAGE_SIZE,
        })
# ===========================================================================


# ===========================================================================
class AccountUnlockView(APIView):
    """
    POST /api/audit/unlock/
    Admin-only: manually unlock a locked account.
    Body: { "username": "..." }
    """
    permission_classes = [IsAdminOrModerator]

    def post(self, request):
        username = request.data.get("username")
        if  not username:
            return Response(
                {"error": "username is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            target = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if  not target.locked_until or target.locked_until <= timezone.now():
            return Response({"status": "Account is not locked."})

        target.locked_until = None
        target.save(update_fields=["locked_until"])

        from .utils import log_event
        log_event(
            "account_unlocked",
            request,
            user=target,
            metadata={"unlocked_by": request.user.username},
        )

        return Response({"status": f"Account '{username}' unlocked."})
# ===========================================================================


# ===========================================================================
class SuspiciousActivityView(APIView):
    """
    GET /api/audit/suspicious/
    Returns accounts with suspicious patterns in the last 24 hours:
    - 3+ failed logins
    - accounts that were locked
    - password resets
    """
    permission_classes = [IsAdminOrModerator]

    def get(self, request):
        since = timezone.now() - timedelta(hours=24)

        # users with multiple failed logins
        from django.db.models import Count
        failed_logins = (
            AuditLog.objects
            .filter(event_type="login_failed", timestamp__gte=since)
            .values("username", "ip_address")
            .annotate(count=Count("id"))
            .filter(count__gte=3)
            .order_by("-count")
        )

        # recent lockouts
        lockouts = (
            AuditLog.objects
            .filter(event_type="account_locked", timestamp__gte=since)
            .values("username", "timestamp", "metadata")
            .order_by("-timestamp")
        )

        # recent password resets
        resets = (
            AuditLog.objects
            .filter(event_type="password_reset", timestamp__gte=since)
            .values("username", "ip_address", "timestamp")
            .order_by("-timestamp")
        )

        return Response({
            "failed_logins":    list(failed_logins),
            "lockouts":         list(lockouts),
            "password_resets":  list(resets),
            "since":            since.isoformat(),
        })
# ===========================================================================

