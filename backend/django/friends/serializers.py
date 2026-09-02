# friends/serializers.py

from rest_framework         import serializers
from django.contrib.auth    import get_user_model

from .models                import FriendRequest

User = get_user_model()


class FriendRequestSerializer(serializers.ModelSerializer):
    from_user   = serializers.StringRelatedField(read_only=True)    # type: ignore[var-annotated]
    to_user     = serializers.StringRelatedField(read_only=True)    # type: ignore[var-annotated]
    sent_by     = serializers.StringRelatedField(read_only=True)    # type: ignore[var-annotated]

    class Meta: # pyright: ignore[reportIncompatibleVariableOverride]
        model   = FriendRequest
        fields  = ["id", "from_user", "to_user", "sent_by", "created_at", "status"]

        read_only_fields = [
            "id", "from_user", "to_user", "sent_by", "created_at", "status"
        ]


