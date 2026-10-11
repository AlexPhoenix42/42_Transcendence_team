# users/api_key_views.py

from rest_framework.views       import APIView
from rest_framework.response    import Response
from rest_framework.request     import Request
from rest_framework.permissions import IsAuthenticated

from .api_key import APIKey


class GenerateAPIKeyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        user = request.user

        # Delete existing key if any
        APIKey.objects.filter(user=user).delete()

        plain_key, prefix, hashed_key = APIKey.generate()

        APIKey.objects.create(
            user=user,
            prefix=prefix,
            hashed_key=hashed_key,
        )

        return Response({
            "api_key": plain_key,
            "message": "Save this key — it won't be shown again.",
        })


class RevokeAPIKeyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        deleted, _ = APIKey.objects.filter(user=request.user).delete()
        if deleted:
            return Response({"status": "API key revoked."})
        return Response({"error": "No API key found."}, status=404)


class APIKeyStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        try:
            key = APIKey.objects.get(user=request.user)
            return Response({
                "has_key": True,
                "prefix": key.prefix,
                "created_at": key.created_at.isoformat(),
            })
        except APIKey.DoesNotExist:
            return Response({"has_key": False})

