from django.urls import path, include
from rest_framework.routers import DefaultRouter
from game.views import (
    GameRoomViewSet, PlayerViewSet, FriendshipViewSet,
    PlayerProfileViewSet, MatchResultViewSet,
)

router = DefaultRouter()
router.register(r'rooms', GameRoomViewSet)
router.register(r'players', PlayerViewSet)
router.register(r'friends', FriendshipViewSet)
router.register(r'profiles', PlayerProfileViewSet)
router.register(r'matches', MatchResultViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
]
