# audit/urls.py

from django.urls import path

from .views import AuditLogListView, AccountUnlockView, SuspiciousActivityView

urlpatterns = [
    path("logs/",       AuditLogListView.as_view(),     name="audit-logs"),
    path("unlock/",     AccountUnlockView.as_view(),    name="audit-unlock"),
    path("suspicious/", SuspiciousActivityView.as_view(), name="audit-suspicious"),
]

