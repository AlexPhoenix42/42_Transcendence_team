# goose_game/urls.py

from django.urls import path
from .views import (
    GooseGameListCreateView,
    GooseGameDetailView,
    GooseGameJoinView,
    GooseGameStartView,
    GooseGameLeaveView,
    GooseGameCancelView,
)

urlpatterns = [
    path("",                 GooseGameListCreateView.as_view(),  name="goose-list-create"),
    path("<int:pk>/",        GooseGameDetailView.as_view(),      name="goose-detail"),
    path("<int:pk>/join/",   GooseGameJoinView.as_view(),        name="goose-join"),
    path("<int:pk>/start/",  GooseGameStartView.as_view(),       name="goose-start"),
    path("<int:pk>/leave/",  GooseGameLeaveView.as_view(),       name="goose-leave"),
    path("<int:pk>/cancel/", GooseGameCancelView.as_view(),      name="goose-cancel"),
]

