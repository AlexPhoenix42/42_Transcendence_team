# config/asgi.py

import os

from django.core.asgi   import get_asgi_application

from channels.routing   import ProtocolTypeRouter, URLRouter

from channels.auth      import AuthMiddlewareStack


os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')


django_asgi_app = get_asgi_application()


# Import chat routing lazily to avoid premature model imports
def get_websocket_application():
    import chat.routing
    import chess_game.routing
    import chess_coach.routing
    return URLRouter(
        chat.routing.websocket_urlpatterns +
        chess_game.routing.websocket_urlpatterns +
        chess_coach.routing.websocket_urlpatterns
    )


application     = ProtocolTypeRouter({
    "http"          : django_asgi_app,
    "websocket"     : AuthMiddlewareStack(
        get_websocket_application(),
        #URLRouter(
        #    chat.routing.websocket_urlpatterns
        #),
    ),
})

