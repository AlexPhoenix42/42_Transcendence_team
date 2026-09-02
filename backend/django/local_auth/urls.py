# local_auth/urls.py

from django.urls    import path

from .views import (
    RegisterView, ProfileUpdateView, VerifyEmailView,
    ResendVerificationView, ThrottledTokenObtainPairView,
    PasswordResetRequestView, PasswordResetRequestConfirmView,
    TwoFactorResetRequestView, TwoFactorResetConfirmView,
    PublicProfileView,
)

urlpatterns = [
    path('login/',                  ThrottledTokenObtainPairView.as_view(),     name='token_obtain_pair'),
    path('register/',               RegisterView.as_view(),                     name='register'),
    path('profile/',                ProfileUpdateView.as_view(),                name='profile_update'),
    path('profile/<str:username>/', PublicProfileView.as_view(),                name="public-profile"),
    path('verify-email/',           VerifyEmailView.as_view(),                  name='verify-email'),
    path('resend-verification/',    ResendVerificationView.as_view(),           name="resend-verification"),
    path("password-reset/request/", PasswordResetRequestView.as_view(),         name="password-reset-request"),
    path("password-reset/confirm/", PasswordResetRequestConfirmView.as_view(),  name="password-reset-confirm"),
    path("2fa-reset/request/",      TwoFactorResetRequestView.as_view(),        name="2fa-reset-request"),
    path("2fa-reset/confirm/",      TwoFactorResetConfirmView.as_view(),        name="2fa-reset-confirm"),
]

