# goose_game/routing.py

from django.urls import path
from . import consumers

websocket_urlpatterns = [
    path("ws/goose/<int:game_id>/", consumers.GooseGameConsumer.as_asgi()),
]

