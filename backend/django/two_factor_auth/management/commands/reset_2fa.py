# two_factor_auth/management/commands/reset_2fa.py

from django.core.management.base import BaseCommand
from two_factor_auth.models import TOTPDevice

class Command(BaseCommand):
    help = 'Remove 2FA for a user (testing only)'

    def add_arguments(self, parser):
        parser.add_argument('username', type=str)

    def handle(self, *args, **options):
        username = options['username']
        deleted, _ = TOTPDevice.objects.filter(user__username=username).delete()
        if deleted:
            self.stdout.write(f'2FA removed for {username}')
        else:
            self.stdout.write(f'No TOTP device found for {username}')

