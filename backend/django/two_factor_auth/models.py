# two_factory_auth/models.py

from django.db      import models

from django.conf    import settings


class TOTPDevice(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='totp_device',
    )

    encrypted_secret    = models.BinaryField()

    is_active           = models.BooleanField(default=False)

    def __str__(self):
        return f"TOTP device for {self.user.username} (active={self.is_active})"

class RecoveryCode(models.Model):
    device = models.ForeignKey(
        TOTPDevice,
        on_delete=models.CASCADE,
        related_name='recovery_codes',
    )

    hashed_code = models.CharField(max_length=128, unique=True)
    
    def __str__(self):
        return f"Recovery code for {self.device.user.username}"

