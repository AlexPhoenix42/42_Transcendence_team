# tournament/models.py

from django.conf        import settings
from django.db          import models

from django.contrib.auth    import get_user_model

User = get_user_model()

# ===========================================================================
class TournamentStatus(models.TextChoices):
    OPEN        = "OPEN",       "Open"
    ONGOING     = "ONGOING",    "Ongoing"
    FINISHED    = "FINISHED",   "Finished"
    CANCELLED   = "CANCELLED",  "Cancelled"
# ===========================================================================


# ===========================================================================
class Tournament(models.Model):
    name        = models.CharField(max_length=100)

    status      = models.CharField(
        max_length=10,
        choices=TournamentStatus.choices,
        default=TournamentStatus.OPEN,
        db_index=True,
    )

    max_players = models.PositiveIntegerField()

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

    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True) 
    start_time  = models.DateTimeField(null=True, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.name} ({self.status})"
# ===========================================================================


# ===========================================================================
class TournamentParticipant(models.Model):
    tournament: models.ForeignKey[Tournament]  = models.ForeignKey(
        Tournament,
        on_delete=models.CASCADE,
        related_name="participants",
    )

    player      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tournament_participations",
    )

    joined_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["tournament", "player"]]
        ordering        = ["joined_at"]

    def __str__(self):
        return f"{self.player} in {self.tournament}"
# ===========================================================================


# ===========================================================================
class MatchStatus(models.TextChoices):
    PENDING     = "PENDING", "Pending"
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    FINISHED    = "FINISHED", "Finished"
# ===========================================================================


# ===========================================================================
class Match(models.Model):
    tournament  = models.ForeignKey(
        Tournament,
        on_delete=models.CASCADE,
        related_name="matches",
    )

    game        = models.OneToOneField(
        "chess_game.Game",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="match",
    )

    player1     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="matches_as_player1",
        null=True,
        blank=True,
    )

    player2     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="matches_as_player2",
        null=True,
        blank=True,
    )

    winner      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="won_matches",
    )

    round_nb    = models.PositiveIntegerField()

    status      = models.CharField(
        max_length=15,
        choices=MatchStatus.choices,
        default=MatchStatus.PENDING,
    )

    created_at  = models.DateTimeField(auto_now_add=True)

    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering    = ["round_nb", "id"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(player1=models.F("player2")),
                name="player_not_self",
            ),
        ]

    def __str__(self):
        return f"Match {self.pk} (R{self.round_nb}) in {self.tournament}"
# ===========================================================================

