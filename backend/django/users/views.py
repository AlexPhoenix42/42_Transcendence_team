#from django.shortcuts import render

from rest_framework.views import APIView
#from rest_framework import authentication
from rest_framework.permissions import IsAuthenticated

from rest_framework.response import Response
from rest_framework.request import Request

from .models import User

from typing import cast
# ===========================================================================
# About 'from typing import cast'
#Case for keeping the cast:
#
#Beyond just silencing the warning, it actually gives you real IDE benefits going forward: autocomplete will now correctly suggest user.is_online, user.rating, user.bio, etc., since Pyright now knows the concrete type. Without the cast, autocomplete on request.user would only offer generic base-user attributes, missing your custom ones entirely.
#If you (or teammates later) typo a field name (e.g., user.rateing), the cast lets the type checker catch that before runtime — a real bug-prevention benefit, not just cosmetic.
#
#Case against (minor):
#
#One extra line, one extra import — negligible cost.
#It's technically "lying" to the type checker in the sense that if this method were ever called somewhere permission_classes didn't guarantee authentication, the cast would hide a real potential bug (accessing attributes on AnonymousUser, which would crash at runtime). But that's true of casts generally — the assumption needs to stay valid.
# ===========================================================================

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request:Request, format=None):
        user = cast(User, request.user)
        resp = {
                "id":           user.pk,
                "username":     user.username,
                "email":        user.email,
                "is_online":    user.is_online, 
                "rating":       user.rating, 
                "bio":          user.bio,
                "avatar":      request.build_absolute_uri(user.avatar.url) if user.avatar else None,
        }
        return Response(resp)

