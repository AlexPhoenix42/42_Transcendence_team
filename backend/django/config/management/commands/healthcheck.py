from django.core.management.base import BaseCommand
from django.db import connections
from django.core.cache import cache

class Command(BaseCommand):
    help = 'Docker health check – exits 0 if DB and cache are reachable'

    def handle(self, *args, **options):
        # Check database
        db_conn = connections['default']
        db_conn.cursor().close()
        # Check cache (Redis)
        cache.set('docker_healthcheck', 1, 10)
        cache.get('docker_healthcheck')
        self.stdout.write('OK')

