# pacman_game/serializers.py
#
# Couche REST du lobby, calquée sur chess_game/serializers.py. Le gros de l'état
# de jeu vit dans Redis (voir consumers.py) ; ici on n'expose que ce que la base
# connaît : la ligne Game d'un salon et ses GamePlayer.

from typing import Any

from rest_framework         import serializers

from .models                import Game, GamePlayer
from .consumers              import _load_state_sync


class GamePlayerSerializer(serializers.ModelSerializer):
    user:   Any = serializers.StringRelatedField()

    class Meta:             # type: ignore[reportIncompatibleVariableOverride]
        model   = GamePlayer
        fields  = [
            "user",
            "role",
            "score",
            "lives",
            "won",
            "joined_at",
        ]
        read_only_fields = fields


class GameSerializer(serializers.ModelSerializer):
    created_by:     Any = serializers.StringRelatedField()
    players             = GamePlayerSerializer(many=True, read_only=True)
    # `GamePlayer` DB rows only get written when a round ENDS (see
    # consumers.py's _persist_result) - counting them here would show 0 for
    # every WAITING/IN_PROGRESS room no matter how many people are actually
    # connected. The real-time roster lives in Redis (RoomState, same cache
    # the WS consumer reads/writes) - read it first, and fall back to the
    # DB count only once the room is over and its Redis entry has expired.
    player_count       = serializers.SerializerMethodField()

    def get_player_count(self, obj: Game) -> int:
        room = _load_state_sync(obj.room_name)
        if room is not None:
            return len(room.players)
        return obj.players.count()

    class Meta:             # type: ignore[reportIncompatibleVariableOverride]
        model   = Game
        fields  = [
            "id",
            "room_name",
            "status",
            "level",
            "map_choice",
            "is_solo",
            "winner",
            "created_by",
            "created_at",
            "started_at",
            "finished_at",
            "duration_seconds",
            "players",
            "player_count",
        ]
        read_only_fields = [
            "id",
            "status",
            "level",
            "winner",
            "created_by",
            "created_at",
            "started_at",
            "finished_at",
            "duration_seconds",
            "players",
            "player_count",
        ]

    def validate_map_choice(self, value: int) -> int:
        if value not in (1, 2, 3):
            raise serializers.ValidationError("Carte 1, 2 ou 3 uniquement.")
        return value

    def validate_room_name(self, value: str) -> str:
        # Même contrainte que _valid_room() côté consumer : slug alphanumérique
        # (tirets/underscores tolérés), 1..100 caractères. On garde les deux
        # portes cohérentes pour qu'un salon créé via REST soit joignable en WS.
        cleaned = value.strip()
        if not (0 < len(cleaned) <= 100):
            raise serializers.ValidationError("1 à 100 caractères.")
        if not cleaned.replace("-", "").replace("_", "").isalnum():
            raise serializers.ValidationError(
                "Lettres, chiffres, '-' et '_' uniquement."
            )
        return cleaned
