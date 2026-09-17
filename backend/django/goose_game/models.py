# goose_game/models.py

from django.conf import settings
from django.db import models


class GooseGameStatus(models.TextChoices):
    WAITING     = "WAITING",     "Waiting for players"
    IN_PROGRESS = "IN_PROGRESS", "In progress"
    FINISHED    = "FINISHED",    "Finished"
    CANCELLED   = "CANCELLED",   "Cancelled"


class GooseGame(models.Model):
    """A Game of the Goose session supporting 2-6 players."""
    name        = models.CharField(max_length=100, blank=True)
    status      = models.CharField(
                    max_length=15,
                    choices=GooseGameStatus.choices,
                    default=GooseGameStatus.WAITING,
                )
    min_players = models.PositiveIntegerField(default=2)
    max_players = models.PositiveIntegerField(default=6)
    created_by  = models.ForeignKey(
                    settings.AUTH_USER_MODEL,
                    on_delete=models.SET_NULL,
                    null=True,
                    related_name="goose_games_created",
                )
    winner      = models.ForeignKey(
                    settings.AUTH_USER_MODEL,
                    on_delete=models.SET_NULL,
                    null=True,
                    blank=True,
                    related_name="goose_games_won",
                )
    current_turn = models.PositiveIntegerField(default=0)  # index into players list
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    wizard_position         = models.PositiveIntegerField(default=0)
    wizard_questions_asked  = models.JSONField(default=list, blank=True)
    wizard_target           = models.ForeignKey(
                                "GoosePlayer",
                                on_delete=models.SET_NULL,
                                null=True,
                                blank=True,
                                related_name="+",
                            )

    TOTAL_SQUARES = 63

    # Special squares
    GOOSE_SQUARES   = {5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59}
    BRIDGE_SQUARE   = 6   # jump to 12
    INN_SQUARE      = 19  # skip next turn
    WELL_SQUARE     = 31  # skip next turn
    MAZE_SQUARE     = 42  # go back to 30
    PRISON_SQUARE   = 52  # skip 2 turns
    DEATH_SQUARE    = 58  # go back to 0

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"GooseGame #{self.pk} ({self.status})"


class GoosePlayer(models.Model):
    """A player in a Game of the Goose."""
    game        = models.ForeignKey(
                    GooseGame,
                    on_delete=models.CASCADE,
                    related_name="players",
                )
    user        = models.ForeignKey(
                    settings.AUTH_USER_MODEL,
                    on_delete=models.CASCADE,
                    related_name="goose_players",
                )
    position    = models.PositiveIntegerField(default=0)
    turn_order  = models.PositiveIntegerField(default=0)
    skip_turns  = models.PositiveIntegerField(default=0)  # turns to skip
    is_active   = models.BooleanField(default=True)  # still in the game
    joined_at   = models.DateTimeField(auto_now_add=True)

    wizard_strikes = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = [["game", "user"]]
        ordering = ["turn_order"]

    def __str__(self):
        return f"{self.user.username} @ square {self.position}"

