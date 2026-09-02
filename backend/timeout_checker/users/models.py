# timeout_checker/users/models.py

from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    class Meta(AbstractUser.Meta):
        db_table = "users"

