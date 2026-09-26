# pacman_game/routing.py

from django.urls            import path

from .                      import consumers


websocket_urlpatterns = [
    path("ws/pacman/<slug:room_name>/",       consumers.GameConsumer.as_asgi()),
    path("ws/pacman-voice/<slug:room_name>/", consumers.VoiceConsumer.as_asgi()),
]
