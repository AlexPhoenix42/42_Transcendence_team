# audit/models.py

from django.conf    import settings
from django.db      import models


class AuditLog(models.Model):
    """
    Immutable log of every security-relevant authentication event.
    Rows are append-only — never updated or deleted by application code.
    """

    EVENT_TYPES = [
        ("login_success",       "Login Success"),
        ("login_failed",        "Login Failed"),
        ("logout",              "Logout"),
        ("password_change",     "Password Change"),
        ("password_reset",      "Password Reset"),
        ("2fa_enabled",         "2FA Enabled"),
        ("2fa_disabled",        "2FA Disabled"),
        ("account_locked",      "Account Locked"),
        ("account_unlocked",    "Account Unlocked"),
    ]

    event_type  = models.CharField(max_length=32, choices=EVENT_TYPES, db_index=True)

    # nullable: failed logins against non-existent usernames have no user
    user        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
    )

    # always stored so we can query by username even if user row is gone
    username    = models.CharField(max_length=150, db_index=True)

    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    user_agent  = models.TextField(blank=True, default="")

    success     = models.BooleanField(default=True)

    # extra context: lock reason, reset method, etc.
    metadata    = models.JSONField(default=dict, blank=True)

    timestamp   = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering            = ["-timestamp"]
        verbose_name        = "Audit Log"
        verbose_name_plural = "Audit Logs"
        indexes = [
            # fast lookups for "recent failures by username" (auto-lock query)
            models.Index(
                fields=["username", "event_type", "timestamp"],
                name="audit_user_event_ts",
            ),
        ]

    def __str__(self):
        return f"[{self.timestamp}] {self.event_type} — {self.username}"

