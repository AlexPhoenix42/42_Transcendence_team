# open_auth/models.py

from django.db      import models
from django.conf    import settings

class OAuthLink(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='oauth_links',
    )

    provider            = models.CharField(max_length=20)
    provider_unique_id  = models.CharField(max_length=255)

    class Meta:
        unique_together = ('provider', 'provider_unique_id')

    def __str__(self):
        return f"{self.provider}:{self.provider_unique_id} -> {self.user_id}" # type: ignore

