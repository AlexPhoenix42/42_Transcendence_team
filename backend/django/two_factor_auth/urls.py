# two_factor_auth/urls.py

from django.urls        import path

from .views             import (
    Enable2FAView, ConfirmEnable2FAView, Verify2FAView, Disable2FAView, Status2FAView)

urlpatterns = [
    path(
        "2fa/status/",
        Status2FAView.as_view(),
        name="2fa-status"
    ),

    path(
        "2fa/enable/",
        Enable2FAView.as_view(),
        name="2fa-enable"
    ),

    path(
        "2fa/disable/",
        Disable2FAView.as_view(),
        name="2fa-disable"
    ),

    path(
        "2fa/confirm-enable/",
        ConfirmEnable2FAView.as_view(),
        name="2fa-confirm-enable"
    ),

    path(
        "2fa/verify/",
        Verify2FAView.as_view(),
        name="2fa-verify"
    ),
]

