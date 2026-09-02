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

    class Meta(AbstractUser.Meta):
        db_table = "users"

    def __str__(self):
        return self.username

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


# Its been moved to the 'friends app'
#class FriendRequest(models.Model):
#    from_user   = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_requests')
#
#    to_user     = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_requests')
#
#    created_at  = models.DateTimeField(auto_now_add=True)
#
#    accepted    = models.BooleanField(default=False)
#
#    class Meta:
#        unique_together = ('from_user', 'to_user')
#
#    def __str__(self):
#        return f"{self.from_user} -> {self.to_user} ({'accepted' if self.accepted else 'pending'})"


# In your serializer or view, add these checks:
#def validate_avatar(self, value):
#    """Validate uploaded avatar"""
#    # 1. Check file size (e.g., max 5MB)
#    if value.size > 5 * 1024 * 1024:
#        raise ValidationError("File too large (max 5MB)")
#    
#    # 2. Check content-type (actual file type, not just extension)
#    if not value.content_type.startswith('image/'):
#        raise ValidationError("File must be an image")
#    
#    # 3. Check dimensions (optional)
#    from PIL import Image
#    img = Image.open(value)
#    if img.width > 2000 or img.height > 2000:
#        raise ValidationError("Image too large (max 2000x2000)")
#    
#    return value

