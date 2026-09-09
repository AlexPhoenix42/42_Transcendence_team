# chat/models.py

from django.db                          import IntegrityError, models, transaction

from django.conf                        import settings

from django.db.models.fields.related    import ManyToManyField


# ===========================================================================
class RoomType(models.TextChoices):
    DM          = "DM", "Direct Message"
    GLOBAL      = "GLOBAL", "Global Chat"
    TOURNAMENT  = "TOURNAMENT", "Tournament Chat"
    GAME        = "GAME", "Game Spectator Chat"
# ===========================================================================


# ===========================================================================
class RoomMembership(models.Model):
    room            = models.ForeignKey(
        "ChatRoom",
        on_delete=models.CASCADE,
        related_name="memberships",
    )

    user            = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    joined_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["room", "user"]]
# ===========================================================================


# ===========================================================================
class ChatRoomManager(models.Manager["ChatRoom"]):
    def get_or_create_dm(self, user1_id: int, user2_id:int) -> "ChatRoom":
        a, b = sorted([user1_id, user2_id])
        with transaction.atomic():
            dm_rooms = ChatRoom.objects.filter(
                room_type=RoomType.DM,
                memberships__user_id=a,
            ).select_for_update()

            existing = dm_rooms.filter(memberships__user_id=b).first()
            if  existing:
                return existing

            #room = self.create(room_type=RoomType.DM)

            #room = self.create(
            #    room_type=RoomType.DM,
            #    dm_hash=f"{a}_{b}"
            #)

            try:
                room = self.create(
                    room_type=RoomType.DM,
                    dm_hash=f"{a}_{b}",
                )

                RoomMembership.objects.bulk_create([
                    RoomMembership(room=room, user_id=a),
                    RoomMembership(room=room, user_id=b),
                ])

                return room
            except IntegrityError:
                # Another request just created this room, fetch and return
                return ChatRoom.objects.get(dm_hash=f"{a}_{b}")
# ===========================================================================


# ===========================================================================
class ChatRoom(models.Model):
    objects         = ChatRoomManager()

    room_type       = models.CharField(
        max_length=20,
        choices=RoomType.choices,
        db_index=True,
    )

    dm_hash         = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        unique=False, # we will use a conditional unique constraint
    )

    created_at      = models.DateTimeField(auto_now_add=True)

    tournament_id   = models.PositiveIntegerField(
        null=True, blank=True, db_index=True,
    )

    game_id         = models.PositiveIntegerField(
        null=True, blank=True, db_index=True,
    )

    # --- Future ForeignKey replacements ---
    #tournament      = models.ForeignKey(
    #    "tournament.Tournament",
    #    null=True, blank=True,
    #    on_delete=models.SET_NULL,
    #    db_index=True,
    #    db_column="tournament_id",
    #)

    #game            = models.ForeignKey(
    #    "game.Game",
    #    null=True, blank=True,
    #    on_delete=models.SET_NULL,
    #    db_index=True,
    #    db_column="game_id",
    #)
    # --------------------------------------

    members: ManyToManyField    = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="RoomMembership",
        related_name="chat_rooms",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["room_type"],
                condition=models.Q(room_type=RoomType.GLOBAL),
                name="unique_global_chat",
            ),

            models.UniqueConstraint(
                fields=["dm_hash"],
                condition=models.Q(room_type=RoomType.DM),
                name="unique_dm_room",
            ),

            models.UniqueConstraint(
                fields=["room_type", "tournament_id"],
                condition=models.Q(room_type=RoomType.TOURNAMENT),
                name="unique_tournament_room",
            ),

            models.UniqueConstraint(
                fields=["room_type", "game_id"],
                condition=models.Q(room_type=RoomType.GAME),
                name="unique_game_room",
            ),
        ]
# ===========================================================================


# ===========================================================================
class Message(models.Model):
    room        = models.ForeignKey(
        ChatRoom,
        on_delete=models.CASCADE,
        related_name="messages",
    )

    #sender      = models.TextField(max_length=2000)

    sender      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    content     = models.TextField(max_length=2000)

    created_at  = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["room", "created_at"]),
        ]

        ordering = ["created_at"]
# ===========================================================================


# ===========================================================================
class BlockedUser(models.Model):
    blocker     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_users",
    )
    blocked     = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_by",
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["blocker", "blocked"]]
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.blocker} blocked {self.blocked}"
# ===========================================================================


# ===========================================================================
class MessageReadStatus(models.Model):
    user        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="read_statuses",
    )
    room        = models.ForeignKey(
        ChatRoom,
        on_delete=models.CASCADE,
        related_name="read_statuses",
    )
    last_read_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [["user", "room"]]

    def __str__(self):
        return f"{self.user} read {self.room} at {self.last_read_at}"
# ===========================================================================


# ===========================================================================
class MutedUser(models.Model):
    user        = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_mutes",
    )
    muted_by    = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mutes_given",
    )
    room        = models.ForeignKey(
        ChatRoom,
        on_delete=models.CASCADE,
        related_name="muted_users",
        null=True,
        blank=True,
    )
    reason      = models.CharField(max_length=200, blank=True)
    expires_at  = models.DateTimeField()
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} muted until {self.expires_at}"

    @property
    def is_active(self):
        from django.utils import timezone
        return self.expires_at > timezone.now()
# ===========================================================================

