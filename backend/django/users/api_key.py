# users/api_key.py

import secrets
import hashlib

from django.db                              import models
from django.conf                            import settings

from rest_framework.authentication          import BaseAuthentication
from rest_framework.exceptions              import AuthenticationFailed


class APIKey(models.Model):
    user        = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="api_key",
    )
    prefix      = models.CharField(max_length=8, unique=True)
    hashed_key  = models.CharField(max_length=128)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "users_apikey"

    def __str__(self):
        return f"API key for {self.user.username} ({self.prefix}...)"

    @staticmethod
    def generate():
        """Generate a new API key. Returns (plain_key, prefix, hashed_key)."""
        plain_key   = secrets.token_urlsafe(32)
        prefix      = plain_key[:8]
        hashed_key  = hashlib.sha256(plain_key.encode()).hexdigest()
        return plain_key, prefix, hashed_key

    @staticmethod
    def verify(plain_key):
        """Look up and verify an API key. Returns the user or None."""
        hashed = hashlib.sha256(plain_key.encode()).hexdigest()
        try:
            api_key = APIKey.objects.select_related("user").get(hashed_key=hashed)
            if not api_key.user.is_active:
                return None
            return api_key.user
        except APIKey.DoesNotExist:
            return None


class APIKeyAuthentication(BaseAuthentication):
    """DRF authentication backend for X-API-Key header."""

    def authenticate(self, request):
        key = request.headers.get("X-API-Key")
        if not key:
            return None

        user = APIKey.verify(key)
        if user is None:
            raise AuthenticationFailed("Invalid or inactive API key.")

        return (user, None)

