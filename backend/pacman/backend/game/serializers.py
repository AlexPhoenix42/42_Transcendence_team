from rest_framework import serializers
from .models import GameRoom, Player, GameState, Friendship, PlayerProfile, MatchResult


class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['id', 'session_id', 'room', 'role', 'nickname', 'score',
                  'lives', 'is_alive', 'is_ready', 'position_x', 'position_y', 'joined_at']
        read_only_fields = ['id', 'joined_at']


class GameStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = GameState
        fields = ['room', 'level', 'dots_remaining', 'power_pellets_remaining',
                  'fruits_collected', 'game_started', 'game_paused', 'updated_at']
        read_only_fields = ['updated_at']


class GameRoomSerializer(serializers.ModelSerializer):
    players = PlayerSerializer(many=True, read_only=True)
    state = GameStateSerializer(read_only=True)
    player_count = serializers.SerializerMethodField()

    class Meta:
        model = GameRoom
        fields = ['id', 'name', 'created_at', 'last_active', 'max_players', 'is_active',
                  'game_started', 'countdown_started', 'countdown_value',
                  'players', 'state', 'player_count']
        read_only_fields = ['id', 'created_at', 'last_active']

    def get_player_count(self, obj):
        return obj.players.count()


class FriendshipSerializer(serializers.ModelSerializer):
    class Meta:
        model = Friendship
        fields = ['id', 'player1_nickname', 'player2_nickname', 'created_at', 'status']
        read_only_fields = ['id', 'created_at']


class PlayerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlayerProfile
        fields = ['nickname', 'total_score', 'games_played', 'games_won', 'created_at', 'last_seen']
        read_only_fields = ['created_at', 'last_seen']


class MatchResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = MatchResult
        fields = ['id', 'room_name', 'played_at', 'duration_seconds',
                  'winner', 'level', 'results']
