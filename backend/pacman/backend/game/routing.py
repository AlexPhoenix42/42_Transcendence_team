from django.urls import path
from . import consumers

websocket_urlpatterns = [
    path('ws/game/<str:room_name>/', consumers.GameConsumer.as_asgi()),
    path('ws/voice/<str:room_name>/', consumers.VoiceConsumer.as_asgi()),
]
