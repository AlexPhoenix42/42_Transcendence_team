# pacman_game/urls.py

from django.urls    import path

from .views         import (
    GameListCreateView, GameDetailView, GameCancelView, GameByRoomView,
)


urlpatterns = [
    path(
        '',
        GameListCreateView.as_view(),
        name="pacman-game-list-create"
    ),

    path(
        '<int:pk>/',
        GameDetailView.as_view(),
        name="pacman-game-detail"
    ),

    path(
        '<int:pk>/cancel/',
        GameCancelView.as_view(),
        name="pacman-game-cancel"
    ),

    path(
        'room/<slug:room_name>/',
        GameByRoomView.as_view(),
        name="pacman-game-by-room"
    ),
]
