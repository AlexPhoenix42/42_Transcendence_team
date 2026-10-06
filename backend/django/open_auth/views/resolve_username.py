# open_auth/views/resolve_username.py

from rest_framework.views           import APIView
from rest_framework.response        import Response
from rest_framework.request         import Request

from django.core.cache              import cache

from ..user_resolution              import resolve_username_conflict


class ResolveUsernameView(APIView):
    permission_classes = []

    def post(self, request: Request) -> Response:
        username    = request.data.get("username")
        token       = request.data.get("token")

        if  not username or not token:
            return Response({"error": "username and token required"}, status=400)

        cache_key   = f"resolve_username:{token}"
        oauth_data  = cache.get(cache_key)

        if  oauth_data is None:
            return Response({"error": "Invalid or expired token"}, status=400)

        # Validate the cached OAuth data has the required fields
        required_fields = ["provider", "provider_id", "email"]
        if  any(key not in oauth_data for key in required_fields):
            return Response({"error": "Invalid token data"}, status=400)

        try:
            user = resolve_username_conflict(username, oauth_data, oauth_data["provider"])
        except ValueError as e:
            return Response({"error": str(e)}, status=409)

        # Consume the token only on success
        cache.delete(cache_key)

        import uuid
        login_token = str(uuid.uuid4())
        cache.set(f"login_token:{login_token}", user.pk, timeout=60)

        return Response({"login_token": login_token})

