from django.urls import path

from .views import MeView, LeaderboardView, MatchHistoryView, UserAnalyticsView, UserListView, UserUpdateView, UserDeleteView, AchievementsView

from .gdpr import ExportDataView, ImportDataView, RequestDeleteView, ConfirmDeleteView

from .api_key_views import GenerateAPIKeyView, RevokeAPIKeyView, APIKeyStatusView

urlpatterns = [
    path(
        'me/', 
        MeView.as_view(), 
        name='me'
    ),

    path(
        'me/api-key/',
        APIKeyStatusView.as_view(),
        name='api-key-status'
    ),

    path(
        'me/api-key/generate/',
        GenerateAPIKeyView.as_view(),
        name='api-key-generate'
    ),

    path(
        'me/api-key/revoke/',
        RevokeAPIKeyView.as_view(),
        name='api-key-revoke'
    ),

    path(
        'leaderboard/', 
        LeaderboardView.as_view(), 
        name='leaderboard'
    ),

    path(
        'match-history/', 
        MatchHistoryView.as_view(), 
        name='match-history'
    ),

    path(
        'match-history/<str:username>/', 
        MatchHistoryView.as_view(),
        name='match-history-user'
    ),

    path(
        'analytics/',
        UserAnalyticsView.as_view(),
        name='user-analytics',
    ),

    path(
        'users/',
        UserListView.as_view(),
        name='user-list'
    ),

    path(
        'users/<int:user_id>/',
        UserUpdateView.as_view(),
        name='user-update'
    ),

    path('users/<int:user_id>/delete/',
         UserDeleteView.as_view(),
         name='user-delete'
    ),

    path(
        'achievements/',
        AchievementsView.as_view(),
        name='achievements'
    ),

    path(
        'achievements/<str:username>/',
        AchievementsView.as_view(),
        name='achievements-user'
    ),

    path(
        'me/export/',
        ExportDataView.as_view(),
        name='export-data'
    ),

    path(
        'me/delete/',
        RequestDeleteView.as_view(),
        name='request-delete'
    ),

    path(
        'me/delete/confirm/',
        ConfirmDeleteView.as_view(),
        name='confirm-delete'
    ),

    path(
        'me/import/',
        ImportDataView.as_view(),
        name='import-dat',
    ),
]

