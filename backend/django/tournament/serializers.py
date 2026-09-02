# tournament/serializers.py

from rest_framework             import serializers

from .models                    import (
    Tournament, TournamentParticipant, Match
)


# ===========================================================================
class TournamentSerializer(serializers.ModelSerializer):
    class Meta: # type: ignore[reportIncompatibleVariableOverride]
        model   = Tournament

        fields  = [
            "id",
            "name",
            "status",
            "max_players",
            "created_by",
            "created_at",
            "updated_at",
            "start_time",
            "description",
        ]

        read_only_fields = [
            "id", "status", "created_by", "created_at", "updated_at"
        ]
# ===========================================================================


# ===========================================================================
class TournamentParticipantSerializer(serializers.ModelSerializer):
    player: serializers.StringRelatedField = serializers.StringRelatedField()  # type: ignore[assignment]  # shows username

    class Meta:     # type: ignore[reportIncompatibleVariableOverride]
        model           = TournamentParticipant

        fields          = ["id", "player", "joined_at"]

        read_only_fields = fields
# ===========================================================================


# ===========================================================================
class MatchSerializer(serializers.ModelSerializer):
    player1: serializers.StringRelatedField = serializers.StringRelatedField()  # type: ignore[assignment]
    player2: serializers.StringRelatedField = serializers.StringRelatedField()  # type: ignore[assignment]
    winner: serializers.StringRelatedField  = serializers.StringRelatedField()  # type: ignore[assignment]

    class Meta: # type: ignore[reportIncompatibleVariableOverride]
        model   = Match
        fields  = [
            "id",
            "tournament",
            "player1",
            "player2",
            "winner",
            "round_nb",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
# ===========================================================================

