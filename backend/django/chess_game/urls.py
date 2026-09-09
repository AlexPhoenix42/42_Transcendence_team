# game/urls.py

from django.urls            import path

from .views                 import (
    GameCancelView, GameCleanupView, GameDetailView, GameJoinView,
    GameLeaveView, GameListCreateView, GameCreateAIView, GameAcceptInviteView,
)


urlpatterns = [
    #path('', GameCreateView.as_view(), name="game-create"),

    path(
        '',
        GameListCreateView.as_view(),
        name="game-list-create",
    ),

    path(
        '<int:pk>/',
        GameDetailView.as_view(),
        name="game-detail",
    ),

    path(
        '<int:pk>/join/',
        GameJoinView.as_view(),
        name="game-join",
    ),

    path(
        '<int:pk>/cancel/',
        GameCancelView.as_view(),
        name="game-cancel",
    ),

    path('cleanup/',
         GameCleanupView.as_view(),
         name="game-cleanup",
    ),

    path('<int:pk>/leave/',
         GameLeaveView.as_view(),
         name="game-leave"),

    path('ai/',
         GameCreateAIView.as_view(),
         name="game-create-ai",
    ),

    path('invite/accept/',
         GameAcceptInviteView.as_view(),
         name="game-accept-invite",
    ),
]

