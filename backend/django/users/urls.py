from django.urls import path

from .views import MeView, LeaderboardView, MatchHistoryView, UserAnalyticsView, UserListView, UserUpdateView, UserDeleteView, AchievementsView

urlpatterns = [
    path(
        'me/', 
        MeView.as_view(), 
        name='me'
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
]

