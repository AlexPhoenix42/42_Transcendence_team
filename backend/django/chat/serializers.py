# chat/serializers.py

from rest_framework         import serializers

from .models                import Message

class MessageSerializer(serializers.ModelSerializer):
    # returns the username
    sender: serializers.StringRelatedField = serializers.StringRelatedField()  # type: ignore[assignment]

    class Meta: # type: ignore[reportIncompatibleVariableOverride]
        model               = Message
        fields              = ["id", "sender", "content", "created_at"]
        read_only_fields    = fields

