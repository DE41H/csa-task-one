from django.db import models
from django.db.transaction import atomic
from django.utils.timezone import now

from participant.models import Participant

# Create your models here.

class Difficulty(models.TextChoices):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    EXTREME = "extreme"
    BRUTAL = "brutal"


class Status():
    UNCLAIMED = "unclaimed"
    IN_PROGRESS = "in_progress"
    CRACKED = "cracked"
    EXPIRED = "expired"


class Mission(models.Model):
    codename = models.CharField(max_length=256, unique=True)
    brief = models.TextField(default="")
    points = models.PositiveIntegerField()
    difficulty = models.CharField(max_length=64, choices=Difficulty.choices)
    deadline = models.DateTimeField()
    claimed_by = models.OneToOneField("participant.Participant", on_delete=models.SET_NULL, related_name="current_mission", null=True, blank=True)
    completed_by = models.ForeignKey("participant.Participant", on_delete=models.SET_NULL, related_name="completed_missions", null=True, blank=True)
    completed_hostel = models.ForeignKey("participant.Hostel", on_delete=models.SET_NULL, related_name="cracked_missions", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-points", "codename"]

    @property
    def status(self):
        if self.completed_by is not None:
            return Status.CRACKED
        elif now() >= self.deadline:
            return Status.EXPIRED
        else:
            if self.claimed_by is None:
                return Status.UNCLAIMED
            else:
                return Status.IN_PROGRESS

    def claim(self, user_id):
        return self.__class__.objects.filter(pk=self.pk, completed_by__isnull=True, claimed_by__isnull=True, deadline__gt=now()).update(claimed_by_id=user_id)

    def drop(self, user_id):
        return self.__class__.objects.filter(pk=self.pk, claimed_by_id=user_id, completed_by__isnull=True).update(claimed_by=None)

    def complete(self, user_id):
        qs = self.__class__.objects.filter(pk=self.pk, claimed_by_id=user_id, completed_by__isnull=True, deadline__gt=now())
        hostel_id = Participant.objects.only("hostel_id").get(id=user_id).hostel_id
        return qs.update(completed_by_id=user_id, claimed_by=None, completed_hostel_id=hostel_id)

    def __str__(self):
        return str(self.codename)
