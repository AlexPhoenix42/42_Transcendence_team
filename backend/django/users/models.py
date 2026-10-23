# users/models.py

from django.core.validators import FileExtensionValidator
from django.db import models
from django.contrib.auth.models import AbstractUser

from django.core.exceptions import ValidationError
from PIL import Image

def validate_image_file(value):
    """Validate that uploaded file is actually an image"""
    # check file size (max 5MB)
    if value.size > 5 * 1024 * 1024:
        raise ValidationError("File too large. Maximum size is 5MB.")

    #validate using PIL
    try:
        value.seek(0)
        img = Image.open(value)
        img.verify()
    except Exception:
        raise ValidationError("Invalid or corrupted image file.")

    value.seek(0)
    return value

def user_avatar_path(instance, filename):
    """Generate path: media/avatars/username_{id}.ext"""
    ext = filename.split('.')[-1]
    return f'avatars/{instance.username}_{instance.pk}.{ext}'

class User(AbstractUser):
    username    = models.CharField(max_length=30, unique=True, ) # editable=False removed it before it creates problems with DRF's ModelSerializer wont inclue it in validated_data
    intra_id    = models.IntegerField(unique=True, null=True, blank=True)
    dispname    = models.CharField(max_length=20, unique=True, null=True, blank=True)
    email       = models.EmailField(unique=True)
    email_verfd = models.BooleanField(default=False)
    is_online   = models.BooleanField(default=False)
    wins        = models.PositiveIntegerField(default=0)
    loss        = models.PositiveIntegerField(default=0)
    draw        = models.PositiveIntegerField(default=0)
    rating      = models.IntegerField(default=1200)

    avatar      = models.ImageField(
                    upload_to=user_avatar_path, null=True, blank=True, 
                    default='avatars/default_avatar.png',
                    validators=[
                        FileExtensionValidator(allowed_extensions=['jpg', 'jpeg', 'png']), validate_image_file,
                    ]
                )

    friends     = models.ManyToManyField('self', symmetrical=True, blank=True)
    bio         = models.TextField(blank=True)

    LANGUAGE_CHOICES = [
        ("en", "English"),
        ("fr", "Français"),
        ("nl", "Nederlands"),
        ("ar", "العربية"),
        ("he", "עברית"),
        ("tlh", "tlhIngan Hol"),
    ]

    language    =   models.CharField(
                        max_length=5,
                        choices=LANGUAGE_CHOICES,
                        default="en",
                    )


    class Role(models.TextChoices):
        USER      = "user",      "User"
        MODERATOR = "moderator", "Moderator"
        ADMIN     = "admin",     "Admin"

    role        = models.CharField(
                    max_length=15,
                    choices=Role.choices,
                    default=Role.USER,
                )

    class Meta(AbstractUser.Meta):
        db_table = "users"

    def __str__(self):
        return self.username

    def save(self, *args, **kwargs):
        if self.pk:
            try:
                old = User.objects.get(pk=self.pk)
                if old.avatar and old.avatar.name != 'avatars/default_avatar.png' and old.avatar != self.avatar:
                    old.avatar.delete(save=False)
            except User.DoesNotExist:
                pass
        super().save(*args, **kwargs)

    def get_display_name(self):
        """Return display_name if set, otherwise username"""
        return self.dispname or self.username

    def update_state(self, result):
        """Update user stats based on game result"""
        if result == 'win':
            self.wins   += 1
            self.rating += 10
        elif result == 'loss':
            self.loss   += 1
            self.rating = max(0, self.rating - 10)
        elif result == 'draw':
            self.draw   += 1
        else:
            raise ValueError(f"Invalid result state: {result}")

