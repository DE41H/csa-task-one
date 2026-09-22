from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db.transaction import atomic
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import Hostel, Participant

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    username = serializers.CharField(max_length=150, write_only=True, validators=[UniqueValidator(queryset=User.objects.all())])
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = Participant
        fields = "__all__"
        read_only_fields = ["user"]

    @atomic
    def create(self, validated_data):
        user = User.objects.create_user(username=validated_data.pop("username"), password=validated_data.pop("password"))
        return Participant.objects.create(user=user, **validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["username"] = instance.user.username
        return data


class ParticipantSerializer(serializers.ModelSerializer):
    hostel = serializers.StringRelatedField()

    class Meta:
        model = Participant
        fields = ["id", "handle", "hostel", "created_at", "updated_at"]
        read_only_fields = fields


class HostelSerializer(serializers.ModelSerializer):
    score = serializers.IntegerField(read_only=True)
    cracked_missions = serializers.SerializerMethodField()

    class Meta:
        model = Hostel
        fields = ["id", "name", "score", "cracked_missions", "created_at", "updated_at"]
        read_only_fields = fields

    def get_cracked_missions(self, obj):
        return obj.cracked_missions.order_by("-points").values("codename", "points", "difficulty", "deadline")
