# local_auth/serializers.py

from django.conf                    import settings
from django.contrib.auth            import get_user_model
from django.contrib.auth.models     import UserManager

from django.core.validators         import validate_email
from django.core.exceptions         import ValidationError

from django.contrib.auth.password_validation import validate_password as django_validate_password

from django.db                      import IntegrityError
from rest_framework                 import serializers


import dns.resolver

from typing import cast

#User = cast(type[Model], get_user_model())
User = get_user_model()

# ==========================================================================
def domain_has_mx(domain: str) -> bool:
    try:
        # Try MX records first (industry standard)
        dns.resolver.resolve(domain, "MX", lifetime=2)
        return True
    except Exception:
        # Fallback: some domains use A records instead of MX
        try:
            dns.resolver.resolve(domain, "A", lifetime=2)
            return True
        except Exception:
            return False
# ==========================================================================


# ==========================================================================
_OPAQUE = "Invalid registration data."


def _reg_err(detail: str):
    """Message précis en dev (DEBUG), opaque en prod (anti-énumération)."""
    return serializers.ValidationError(detail if settings.DEBUG else _OPAQUE)


class RegisterSerializer(serializers.ModelSerializer):
    email       = serializers.CharField(write_only=True) 
    password    = serializers.CharField(write_only=True)

    class Meta:         # pyright: ignore[reportIncompatibleVariableOverride]
        model   = User
        fields  = ("username", "email", "password")

    # =================================================
    def validate_email(self, value):
        # Strip whitespace
        value = value.strip()

        # Step 1: RFC syntax validation
        try:
            validate_email(value)
        except ValidationError:
            raise _reg_err("Invalid email format.")

        # length check (RFC 5321: max 254 characters for a full email address)
        if  len(value) > 254:
            raise _reg_err("Email too long.")

        # Step 2: check if mail already exists
        if User.objects.filter(email=value).exists():
            raise _reg_err("Email already registered.")

        # Step 2: Extract domain
        domain = value.split("@")[-1].lower()

        # Step 3: MX record validation (sautée en dev pour permettre les
        # comptes de test avec un domaine bidon)
        if not settings.DEBUG and not domain_has_mx(domain):
            raise _reg_err("Email domain cannot receive mail.")

        return value
    # =================================================


    # =================================================
    def validate_username(self, value):
        import re

        # strip whitespace
        value = value.strip()

        # check if username field is present
        if  not value:
            raise _reg_err("Username is required.")

        # Check limits (Django's AbstractUser defaults: 1-150)
        if  len(value) < 3 or len(value) > 30:
            raise _reg_err("Username must be 3-30 characters.")

        # Allow characters: letters, digits, underscore, hyphen
        if  not re.fullmatch(r"[\w-]+", value):
            raise _reg_err("Username: letters, digits, - and _ only.")

        if User.objects.filter(username=value).exists():
            raise _reg_err("Username already taken.")

        return value
    # =================================================


    # =================================================
    def validate_password(self, value):
        # Strip whitespace (passwords should not be trimmed, but leading/trailing spaces are usually accidental)
        if  value != value.strip():
            raise _reg_err("Password has leading/trailing spaces.")

        # Length limits
        if  len(value) < 8 or len(value) > 128:
            raise _reg_err("Password must be 8-128 characters.")

        # Django's build-in validators (minimum length, numeric, common passwords, etc.)
        django_validate_password(value)

        return value
    # =================================================


    # =================================================
    def create(self, validated_data):
        try:
            # use create_user so password is hashed
            manager = cast(UserManager, User.objects)
            user = manager.create_user(
                    username=validated_data["username"],
                    email=validated_data["email"],
                    password=validated_data["password"],
            )
            return user
        except IntegrityError:
            raise _reg_err("Username or email already used.")
    # =================================================
# ==========================================================================


# ==========================================================================
class ProfileUpdateSerializer(serializers.ModelSerializer):
    username    = serializers.CharField(read_only=True)
    class Meta:         # pyright: ignore[reportIncompatibleVariableOverride]
        model   = User
        fields  = ["username", "dispname", "avatar", "bio"]
# ==========================================================================

