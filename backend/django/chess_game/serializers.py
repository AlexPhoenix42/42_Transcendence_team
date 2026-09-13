# chess_game/serializers.py

from typing import Any

from rest_framework         import serializers

from .models                import Game


class GameSerializer(serializers.ModelSerializer):
    player1:        Any     = serializers.StringRelatedField()
    player2:        Any     = serializers.StringRelatedField()
    player1_id:     Any     = serializers.ReadOnlyField()
    player2_id:     Any     = serializers.ReadOnlyField()
    winner:         Any     = serializers.StringRelatedField()
    crnt_turn:      Any     = serializers.StringRelatedField()
    created_by:     Any     = serializers.StringRelatedField()

    class Meta:             # type: ignore[reportIncompatibleVariableOverride]
        model   = Game
        fields  = [
            "id",
            "player1",
            "player2",
            "player1_id",
            "player2_id",
            "player1_color",
            "player2_is_ai",
            "ai_difficulty",
            "status",
            "timer",
            "winner",
            "result_reason",
            "board_state",
            "moves",
            "crnt_turn",
            "created_by",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "player1",
            "player2",
            "player1_id",
            "player2_id",
            "player1_color",
            "player2_is_ai",
            "ai_difficulty",
            "status",
            "winner",
            "result_reason",
            "moves",
            "crnt_turn",
            "created_by",
            "created_at",
            "updated_at",
        ]

