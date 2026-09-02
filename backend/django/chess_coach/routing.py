# chess_coach/routing.py

from django.urls                import re_path

from chess_coach.consumers      import CoachConsumer


websocket_urlpatterns = [
    re_path(r"ws/coach/$", CoachConsumer.as_asgi()),    # type: ignore[arg-type]
]

