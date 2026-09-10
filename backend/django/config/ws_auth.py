# config/ws_auth.py
#
# Auth WebSocket par JWT en query-string (?token=<access>), en plus de la
# session Django. Le front React est JWT-only (pas de sessionid pour un login
# local), donc AuthMiddlewareStack seul laisse scope["user"] anonyme et les
# consumers ferment en 4001. Ce middleware tente d'abord le JWT ; s'il échoue
# on garde l'utilisateur déjà résolu par la stack de session.
#
# Tous les imports Django sont paresseux : asgi.py importe ce module AVANT
# get_asgi_application(), donc les settings ne sont pas encore chargés ici.

from urllib.parse import parse_qs

from channels.auth  import AuthMiddlewareStack
from channels.db    import database_sync_to_async


@database_sync_to_async
def _user_from_token(token: str):
    from django.contrib.auth                    import get_user_model
    from django.contrib.auth.models             import AnonymousUser
    from rest_framework_simplejwt.tokens        import AccessToken
    from rest_framework_simplejwt.exceptions    import TokenError

    try:
        data = AccessToken(token)
    except TokenError:
        return AnonymousUser()

    user_id = data.get("user_id")
    if user_id is None:
        return AnonymousUser()

    User = get_user_model()
    try:
        return User.objects.get(pk=user_id, is_active=True)
    except User.DoesNotExist:
        return AnonymousUser()


class JWTAuthMiddleware:
    """Résout scope["user"] depuis ?token=<jwt> ; sinon laisse la valeur
    posée par le middleware interne (session)."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        qs = parse_qs((scope.get("query_string") or b"").decode())
        token = qs.get("token", [None])[0]

        if token:
            user = await _user_from_token(token)
            if user is not None and user.is_authenticated:
                scope["user"] = user

        return await self.inner(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    # JWT d'abord, session en repli.
    return JWTAuthMiddleware(AuthMiddlewareStack(inner))
