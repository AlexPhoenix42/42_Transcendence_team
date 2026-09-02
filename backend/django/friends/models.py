# friends/models.py

from django.conf                    import settings
from django.db                      import models

from django.core.exceptions         import ValidationError

class FriendRequest(models.Model):
    class Status(models.TextChoices):
        PENDING     = "pending", "Pending"
        ACCEPTED    = "accepted", "Accepted"
        DECLINED    = "declined", "Declined"

    from_user       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_friend_requests",
    )

    to_user         = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="recv_friend_requests",
    )

    sent_by         = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="initiated_friend_requests",
    )

    status          = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )

    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            # Only one pending request per direction at a time
            #models.UniqueConstraint(
            #    fields=["from_user", "to_user"],
            #    condition=models.Q(status="pending"),
            #    name="unique_pending_request",
            #),

            # Also prevent the reverse direction having a pending request
            # simultaneously
            #models.UniqueConstraint(
            #    fields=["to_user", "from_user"],
            #    condition=models.Q(status="pending"),
            #    name="unique_pending_request_reverse",
            #),

            models.UniqueConstraint(
                fields=["from_user", "to_user"],
                condition=models.Q(status="pending"),
                name="unique_pending_friend_request",
            )
        ]

        indexes = [
            models.Index(fields=["to_user", "status"]),
            models.Index(fields=["from_user", "status"]),
        ]

    def clean(self):
        """Normalise direction: always store from_user < to_user."""
        if  self.from_user.pk and self.to_user.pk:
            if  self.from_user.pk > self.to_user.pk:
                raise ValidationError("Friend request direction must normalised (from_user < to_user).")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.from_user} -> {self.to_user} ({self.status})"


