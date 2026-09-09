from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

class GameRoom(models.Model):
    """Modèle pour une salle de jeu"""
    name = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Dernier signe de vie (connexion ou message WebSocket) dans ce salon.
    # Sert au nettoyage automatique des salons vides.
    last_active = models.DateTimeField(default=timezone.now, db_index=True)
    max_players = models.IntegerField(default=20)
    is_active = models.BooleanField(default=True)
    game_started = models.BooleanField(default=False)
    countdown_started = models.BooleanField(default=False)
    countdown_value = models.IntegerField(default=0)

    def __str__(self):
        return self.name


class Player(models.Model):
    """Modèle pour un joueur"""
    ROLES = [
        ('pacman', 'Pacman'),
        ('madame_pacman', 'Madame Pacman'),
        ('baby', 'Bébé Pacman'),
        ('builder', 'Constructeur de murs'),
        ('ghost', 'Fantôme'),
    ]

    session_id = models.CharField(max_length=255, unique=True)
    room = models.ForeignKey(GameRoom, on_delete=models.CASCADE, related_name='players')
    role = models.CharField(max_length=20, choices=ROLES, default='pacman')
    nickname = models.CharField(max_length=50, default='Joueur')
    score = models.IntegerField(default=0)
    lives = models.IntegerField(default=3)
    is_alive = models.BooleanField(default=True)
    is_ready = models.BooleanField(default=False)
    position_x = models.FloatField(default=0)
    position_y = models.FloatField(default=0)
    joined_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.nickname} ({self.role})"


class Friendship(models.Model):
    """Modèle pour les relations d'amitié entre joueurs"""
    player1_nickname = models.CharField(max_length=50)
    player2_nickname = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20,
        choices=[
            ('pending', 'En attente'),
            ('accepted', 'Acceptée'),
            ('rejected', 'Refusée')
        ],
        default='pending'
    )

    class Meta:
        unique_together = ['player1_nickname', 'player2_nickname']
        indexes = [
            models.Index(fields=['player1_nickname']),
            models.Index(fields=['player2_nickname']),
        ]

    def __str__(self):
        return f"{self.player1_nickname} <-> {self.player2_nickname} ({self.status})"


class PlayerProfile(models.Model):
    """Profil de joueur avec statistiques"""
    nickname = models.CharField(max_length=50, unique=True, db_index=True)
    total_score = models.IntegerField(default=0)
    games_played = models.IntegerField(default=0)
    games_won = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.nickname


class MatchResult(models.Model):
    """Une manche multijoueur terminée (historique + classement)."""
    WINNERS = [('pacman', 'Équipe Pac-Man'), ('ghosts', 'Équipe Fantômes')]

    room_name = models.CharField(max_length=100, db_index=True)
    played_at = models.DateTimeField(auto_now_add=True, db_index=True)
    duration_seconds = models.IntegerField(default=0)
    winner = models.CharField(max_length=10, choices=WINNERS)
    level = models.IntegerField(default=1)
    # [{'name', 'role', 'score', 'lives'}] — un par joueur (hors spectateurs).
    results = models.JSONField(default=list)

    class Meta:
        ordering = ['-played_at']

    def __str__(self):
        return f"{self.room_name} — {self.winner} ({self.played_at:%Y-%m-%d %H:%M})"


class GameState(models.Model):
    """Modèle pour l'état du jeu"""
    room = models.OneToOneField(GameRoom, on_delete=models.CASCADE, related_name='state')
    level = models.IntegerField(default=1)
    dots_remaining = models.IntegerField(default=244)
    power_pellets_remaining = models.IntegerField(default=4)
    fruits_collected = models.IntegerField(default=0)
    game_started = models.BooleanField(default=False)
    game_paused = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"État de {self.room.name}"
