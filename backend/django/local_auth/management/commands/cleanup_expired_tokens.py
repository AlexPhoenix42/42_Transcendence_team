from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from local_auth.models import EmailVerificationToken, ResetToken

# To use just run manually to clean:
# docker exec trans_backend_django python manage.py cleanup_expired_tokens

class Command(BaseCommand):
    help = (
        "Delete expired EmailVerificationToken and ResetToken rows. "
        "Verification tokens expire after 3 days; reset tokens after 1 hour. "
        "Safe to run at any time."
    )

    def handle(self, *args, **options):
        now = timezone.now()
        verification_max_age = timedelta(days=3)
        reset_max_age = timedelta(hours=1)

        # Email verification tokens
        deleted_v, _ = EmailVerificationToken.objects.filter(
            created_at__lt=now - verification_max_age
        ).delete()
        self.stdout.write(f"Deleted {deleted_v} expired email verification token(s)")

        # Reset tokens (password + 2FA)
        deleted_r, _ = ResetToken.objects.filter(
            created_at__lt=now - reset_max_age
        ).delete()
        self.stdout.write(f"Deleted {deleted_r} expired reset token(s)")

