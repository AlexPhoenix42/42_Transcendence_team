# local_auth/models.py

from django.db          import models

from django.conf        import settings


class EmailVerificationToken(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='email_verification_token',
    )

    hashed_token    = models.CharField(max_length=128)
    created_at      = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Verification token for {self.user.username}"

class ResetToken(models.Model):
    TOKEN_TYPES = [
        ("password", "Password Reset"),
        ("2fa", "2FA Reset"),
        ("delete", "Account Deletion"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reset_tokens",
    )

    token_type      = models.CharField(max_length=10, choices=TOKEN_TYPES)
    hashed_token    = models.CharField(max_length=128)
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "token_type")

    def __str__(self):
        return f"{self.token_type} reset token for {self.user.username}"

