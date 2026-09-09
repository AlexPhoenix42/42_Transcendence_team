# chat/serializers.py

from rest_framework         import serializers

from .models                import Message

class MessageSerializer(serializers.ModelSerializer):
    sender      = serializers.SerializerMethodField()
    sender_role = serializers.SerializerMethodField()

    class Meta: # type: ignore[reportIncompatibleVariableOverride]
        model               = Message
        fields              = ["id", "sender", "sender_role", "content", "created_at"]
        read_only_fields    = fields

    def get_sender(self, obj) -> str:
        return obj.sender.username if obj.sender else "system"

    def get_sender_role(self, obj) -> str:
        return obj.sender.role if obj.sender else "system"

