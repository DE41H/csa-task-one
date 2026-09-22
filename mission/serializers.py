from rest_framework import serializers
from participant.serializers import ParticipantSerializer

from .models import Mission

class MissionSerializer(serializers.ModelSerializer):
    status = serializers.CharField(read_only=True)
    claimed_by = ParticipantSerializer(read_only=True)
    completed_by = ParticipantSerializer(read_only=True)

    class Meta:
        model = Mission
        fields = "__all__"
        read_only_fields = ["created_at", "updated_at"]
