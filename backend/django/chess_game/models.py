# game/models.py

from django.conf                import settings
from django.db                  import models

from typing                     import TYPE_CHECKING

if  TYPE_CHECKING:
    from users.models import User as User
else:
    User = None

class GameStatus(models.TextChoices):
    WAITING         = "WAITING",        "Waiting For Opponent"
    IN_PROGRESS     = "IN_PROGRESS",    "In Progress"
    FINISHED        = "FINISHED",       "Finished"
    CANCELLED       = "CANCELLED",      "Cancelled"


class GameResultReason(models.TextChoices):
    CHECKMATE       = "CHECKMATE",      "Checkmate"
    RESIGNATION     = "RESIGNATION",    "Resignation"
    TIMEOUT         = "TIMEOUT",        "Time out"
    DISCONNECT      = "DISCONNECT",     "Disconnected"
    CANCELLED       = "CANCELLED",      "Cancelled"


class Game(models.Model):
    INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

    player1     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="games_as_player1",
    )

    player2     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="games_as_player2",
    )

    player1_color = models.BooleanField(
        null=True,
        blank=True,
        help_text="True = player1 is white, False = player1 is black. Set when game starts.",
    )

    player2_is_ai   = models.BooleanField(default=False)
    ai_difficulty   = models.CharField(
        max_length=10,
        choices=[("easy", "Easy"), ("medium", "Medium"), ("hard", "Hard")],
        null=True,
        blank=True,
    )

    status      = models.CharField(
        max_length=15,
        choices=GameStatus.choices,
        default=GameStatus.WAITING,
        db_index=True,
    )

    timer       = models.CharField(
        max_length=20,
        choices=[
            (None, "unlimited"),
            ("3+2", "3 min + 2 sec"),
            ("5+0", "5 min"),
            ("10+5", "10 min + 5 sec"),
        ],
        default=None,
        null=True,
        blank=True,
    )

    winner: models.ForeignKey[User | None]  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="won_games",
    )

    result_reason = models.CharField(
        max_length=15,
        choices=GameResultReason.choices,
        null=True,
        blank=True,
    )

    board_state = models.TextField(
        default=INITIAL_FEN,
        help_text="FEN notation, stored only at the game end, live state in Redis.",
    )

    moves       = models.JSONField(
        default=list,
        help_text="Full move list, saved only at game end",
    )

    crnt_turn: models.ForeignKey[User | None] = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="games_to_move",
    )

    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_games",
    )

    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering    = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(player1=models.F("player2")),
                name="game_player_not_self",
            ),
        ]

    def __str__(self):
        return f"Game {self.pk} ({self.status})"

