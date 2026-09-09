from django.contrib import admin
from .models import GameRoom, Player, GameState

@admin.register(GameRoom)
class GameRoomAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_at', 'max_players', 'is_active']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name']


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ['nickname', 'role', 'room', 'score', 'lives', 'is_alive']
    list_filter = ['role', 'is_alive', 'room']
    search_fields = ['nickname', 'session_id']


@admin.register(GameState)
class GameStateAdmin(admin.ModelAdmin):
    list_display = ['room', 'level', 'dots_remaining', 'game_started', 'game_paused']
    list_filter = ['game_started', 'game_paused']
