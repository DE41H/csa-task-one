from django.conf import settings
from django.db import models

# Create your models here.

class Participant(models.Model):
    handle = models.CharField(max_length=128, unique=True)
    hostel = models.ForeignKey("participant.Hostel", on_delete=models.PROTECT, related_name="participants")
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="participant")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["handle"]

    def __str__(self):
        return str(self.handle)


class Hostel(models.Model):
    name = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return str(self.name)
