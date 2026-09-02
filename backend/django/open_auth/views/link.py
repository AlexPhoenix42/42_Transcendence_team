# open_auth/views/link.py

from __future__                     import annotations
from typing                         import TYPE_CHECKING, cast

from rest_framework.views           import APIView
from rest_framework.response        import Response
from rest_framework.request         import Request
from rest_framework.permissions     import IsAuthenticated

#from typing                         import cast
#from django.contrib.auth.models     import AbstractUser

from django.core.cache              import cache
from django.db                      import IntegrityError

from ..models                       import OAuthLink

if  TYPE_CHECKING:
    from users.models import User as User
else:
    from django.contrib.auth import get_user_model
    User = get_user_model()


class LinkAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        # CSRF protection
        if  request.headers.get("X-Requested-With") != "XMLHttpRequest":
            return Response({"error": "Missing required header."}, status=400)

        link_token  = request.data.get("link_token")
        if  not link_token:
            return Response({"error": "link_token required"}, status=400)

        cache_key   = f"link_token:{link_token}"
        oauth_data  = cache.get(cache_key)

        if  oauth_data is None:
            return Response({"error": "Invalid or expired link token"}, status=400)

        # Ownership verification: the authenticated user must own the conflicting email
        #        assert request.user.is_authenticated, "IsAuthenticated permission should prevent this"
        
        if  not request.user.is_authenticated:
            return Response({"error": "Authentication required."}, status=401)

        user = cast(User, request.user)

        #if  user.email != oauth_data["email"]:
        #    return Response({"error": "Email mismatch."}, status=403)

        # Determine the matching field based on the conflict type
        conflict_type = oauth_data.get("conflict_type", "email")
        if  conflict_type == "username":
            if  user.username != oauth_data["username"]:
                return Response({"error": "Username mismatch."}, status=403)
        elif user.email != oauth_data["email"]:
            return Response({"error": "Email mismatch."}, status=403)

        try:
            OAuthLink.objects.create(
                user=user,
                provider=oauth_data["provider"],
                provider_unique_id=oauth_data["provider_id"],
            )
        except IntegrityError:
            # Link already exists (should be rare)
            return Response({"error": "Account already linked."}, status=409)
        
        # consume the token
        cache.delete(cache_key)

        return Response({"status": "linked"})

