# game/management/commands/cleanup_stale_games.py

from datetime                           import timedelta

from django.core.management.base        import BaseCommand

from django.utils                       import timezone

from chess_game.models                  import Game, GameStatus, GameResultReason

import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = "Cancel all WAITING games older than a given timeout (default 30min)."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--timeout",
            type=int,
            default=30,
            help="Timeout in minutes (default: 30).",
        )


    def handle(self, *args, **options) -> None:
        timeout_minutes = options["timeout"]
        cutoff          = timezone.now() - timedelta(minutes=timeout_minutes)

        stale_games     = Game.objects.filter(
            status=GameStatus.WAITING,
            created_at__lt=cutoff,
        )

        cnt             = stale_games.count()
        #stale_games.update(status=GameStatus.CANCELLED)
        stale_games.update(
            status=GameStatus.CANCELLED,
            result_reason=GameResultReason.CANCELLED,
        )

        logger.info("Cancel %d stale WAITING game older than %d minutes.", cnt, timeout_minutes)

        self.stdout.write(self.style.SUCCESS(f"Cancel {cnt} stale game(s)."))

