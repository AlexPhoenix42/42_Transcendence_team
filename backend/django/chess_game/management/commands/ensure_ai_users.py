# chess_game/management/commands/ensure_ai_users.py

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

class Command(BaseCommand):
    help = "Create Stockfish AI users if they don't exist"

    def handle(self, *args, **options):
        if not User.objects.filter(username="stockfish_ai").exists():
            User.objects.create_user(username="stockfish_ai", password=None, email="stockfish_ai@ai.local")
            self.stdout.write("  Created stockfish_ai")
        for i in range(1, 16):
            name = f"stockfish_ai_{i}"
            if not User.objects.filter(username=name).exists():
                User.objects.create_user(username=name, password=None, email=f"{name}@ai.local")
                self.stdout.write(f"  Created {name}")
        self.stdout.write(self.style.SUCCESS("✅ AI users ready."))

