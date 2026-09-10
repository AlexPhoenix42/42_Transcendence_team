# pacman_game/models.py
#
# Table shape ported from pacman_ft_transcendence (backend/game/models.py +
# room_state.py) — NOT from pacman-plan.md, which describes a different,
# unconfirmed ruleset. Roles below are the ones actually implemented and
# committed there (commit 2c46068): 'blocker' is a Pac-Man who builds
# anti-ghost walls and is imprisoned instead of dying, not a ghost.

from django.conf  import settings
from django.db     import models
from django.utils  import timezone


class GameStatus(models.TextChoices):
    WAITING     = "WAITING",     "En attente"
    IN_PROGRESS = "IN_PROGRESS", "En cours"
    FINISHED    = "FINISHED",    "Terminée"
    CANCELLED   = "CANCELLED",   "Annulée"


class PlayerRole(models.TextChoices):
    PACMAN          = "pacman",         "Pac-Man"
    MADAME_PACMAN   = "madame_pacman",  "Ms Pac-Man"
    BABY            = "baby",           "Bébé"
    BLOCKER         = "blocker",        "Blocker"
    BUILDER         = "builder",        "Builder"
    GHOST           = "ghost",          "Fantôme"
    SPECTATOR       = "spectator",      "Spectateur"


# Rôles qui mangent les grains / comptent pour la victoire Pac-Man.
PACMAN_ROLES = (
    PlayerRole.PACMAN, PlayerRole.MADAME_PACMAN,
    PlayerRole.BABY, PlayerRole.BLOCKER,
)
GHOST_ROLES  = (PlayerRole.BUILDER, PlayerRole.GHOST)


class Winner(models.TextChoices):
    PACMAN = "pacman", "Équipe Pac-Man"
    GHOSTS = "ghosts", "Équipe Fantômes"


class Game(models.Model):
    """Une salle/manche de Pac-Man multijoueur."""

    room_name   = models.SlugField(max_length=100, unique=True)
    status      = models.CharField(
        max_length=15, choices=GameStatus.choices,
        default=GameStatus.WAITING, db_index=True,
    )
    level       = models.PositiveSmallIntegerField(default=1)
    winner      = models.CharField(
        max_length=10, choices=Winner.choices, null=True, blank=True,
    )

    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="created_pacman_games",
    )

    created_at  = models.DateTimeField(auto_now_add=True)
    last_active = models.DateTimeField(default=timezone.now, db_index=True)
    started_at  = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"PacmanGame {self.room_name} ({self.status})"


class GamePlayer(models.Model):
    """Un joueur (ou spectateur) dans une manche : son rôle et son résultat.

    `role='spectator'` n'entre ni dans PACMAN_ROLES ni dans GHOST_ROLES —
    il regarde sans jouer, comme côté pacman_ft_transcendence.
    """

    game    = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="players")
    user    = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="pacman_games",
    )
    role    = models.CharField(
        max_length=20, choices=PlayerRole.choices, default=PlayerRole.PACMAN,
    )
    score   = models.PositiveIntegerField(default=0)
    lives   = models.PositiveSmallIntegerField(default=3)
    won     = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-score"]
        constraints = [
            models.UniqueConstraint(
                fields=["game", "user"], name="pacman_one_row_per_user_per_game",
            ),
        ]

    def __str__(self):
        return f"{self.user} — {self.role} ({self.score} pts)"
