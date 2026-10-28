# audit/admin.py

from django.contrib import admin
from .models        import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display    = ("timestamp", "event_type", "username", "ip_address", "success")
    list_filter     = ("event_type", "success")
    search_fields   = ("username", "ip_address")
    readonly_fields = (
        "event_type", "user", "username", "ip_address",
        "user_agent", "success", "metadata", "timestamp",
    )
    ordering        = ("-timestamp",)

    def has_add_permission(self, request):
        return False        # audit logs are append-only via code

    def has_change_permission(self, request, obj=None):
        return False        # immutable

    def has_delete_permission(self, request, obj=None):
        return False        # never delete audit trails

