# pacman_game/urls.py

from django.urls    import path

from .views         import GameListCreateView, GameDetailView, GameCancelView


urlpatterns = [
    path('',                 GameListCreateView.as_view(), name="pacman-game-list-create"),
    path('<int:pk>/',        GameDetailView.as_view(),     name="pacman-game-detail"),
    path('<int:pk>/cancel/', GameCancelView.as_view(),     name="pacman-game-cancel"),
]
