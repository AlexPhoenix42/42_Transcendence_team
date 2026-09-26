# goose_game/serializers.py

from rest_framework import serializers
from .models import GooseGame, GoosePlayer


class GoosePlayerSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    avatar   = serializers.SerializerMethodField()

    class Meta:
        model  = GoosePlayer
        fields = ["id", "username", "position", "turn_order", "skip_turns", "is_active", "wizard_strikes", "avatar"]

    def get_avatar(self, obj) -> str | None:
        request = self.context.get("request")
        if obj.user.avatar and request:
            return request.build_absolute_uri(obj.user.avatar.url)
        return None


class GooseGameSerializer(serializers.ModelSerializer):
    players     = GoosePlayerSerializer(many=True, read_only=True)
    created_by  = serializers.StringRelatedField()
    winner_name = serializers.CharField(source="winner.username", read_only=True, default=None)
    player_count = serializers.SerializerMethodField()

    class Meta:
        model  = GooseGame
        fields = [
            "id", "name", "status", "min_players", "max_players",
            "created_by", "winner", "winner_name", "current_turn",
            "player_count", "players", "created_at", "wizard_position",
        ]

    def get_player_count(self, obj) -> int:
        return obj.players.count()

