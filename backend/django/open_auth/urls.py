#from django.urls    import path
#from .              import views
#
#urlpatterns = [
#    #path('42/login/', views.forty_two_login, name='forty_two_login'),
#    #path('42/callback/', views.forty_two_callback, name='forty_two_callback'),
#    #path('42/exchange/', views.ExchangeCodeView.as_view(), name='exchange_code'),
#    #path('google/login/', views.google_login, name='google_login'),
#    #path('google/callback/', views.google_callback, name='google_callback'),
#    #path('google/exchange/', views.GoogleExchangeCodeView.as_view(), name='google_exchange'),
#    #path('status/', views.OAuthStatusView.as_view(), name='oauth_status'),
#    #path('provider/', views.OAuthProviderView.as_view(), name='oauth_provider'),
#]


# open_auth/urls.py

from django.urls                import path

from .views.login               import OAuthLoginView
from .views.callback            import OAuthCallbackView
from .views.exchange            import TokenExchangeView
from .views.refresh             import TokenRefreshView
from .views.link                import LinkAccountView
from .views.resolve_username    import ResolveUsernameView
from .views.logout              import LogoutView

urlpatterns = [
    # Start OAuth flow
    path(
        "<str:provider_name>/login/",
        OAuthLoginView.as_view(),
        name="oauth-login",
    ),

    # Provide callback
    path(
        "<str:provider_name>/callback/",
        OAuthCallbackView.as_view(),
        name="oauth-callback",
    ),

    # Exchange login_token for JWT
    path(
        "exchange/",
        TokenExchangeView.as_view(),
        name="token-exchange",
    ),

    # Refresh access token
    path(
        "refresh/",
        TokenRefreshView.as_view(),
        name="token-refresh",
    ),

    # Case of OAuth Linking 
    path("link/", LinkAccountView.as_view(), name="account-link"),

    # Resolve username conflict after OAuth
    path("resolve-username/", ResolveUsernameView.as_view(), name="resolve-username"),

    # User Logout
    path("logout/", LogoutView.as_view(), name="logout"),
]

