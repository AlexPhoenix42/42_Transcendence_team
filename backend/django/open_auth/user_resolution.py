# open_auth/user_resolution.py

from __future__             import annotations

from dataclasses            import dataclass
from typing import TYPE_CHECKING
#from django.contrib.auth    import get_user_model
#from django.contrib.auth.models import AbstractUser

from .providers.base       import OAuthUserData
from .models                import OAuthLink

from django.db              import IntegrityError, transaction

if  TYPE_CHECKING:
    # Import your actual User model only for static analysis.
    # The path must match your project layout, e.g. 'users.models.User'.
    from users.models import User as User
else:
    # At runtime, use the standard Django way.
    from django.contrib.auth import get_user_model
    User = get_user_model()

#User = get_user_model()

@dataclass(frozen=True)
class AuthSuccess:
    user: User


@dataclass(frozen=True)
class EmailConflict:
    email               : str


@dataclass(frozen=True)
class UsernameConflict:
    username    : str
    oauth_data  : OAuthUserData


@dataclass(frozen=True)
class LinkedEmailConflict:
    current_email       : str
    new_email           : str


@transaction.atomic
def resolve_user(oauth_data: OAuthUserData, provider: str):
    """
    Find or create a local user for the given OAuth identity.
    Return an instance of AuthSuccess, EmailConflict, UsernameConflict,
    or LinkedEmailConflict.
    """
    link = (
        OAuthLink.objects.select_related('user').filter(
            provider=provider,
            provider_unique_id=oauth_data.provider_id
        ).first()
    )

    if  link:
        user    = link.user
        updated = False

        # update display name if we dont have one
        if  not user.dispname and oauth_data.dispname:
            user.dispname   = oauth_data.dispname
            updated         = True

        # chceck email change
        if  user.email != oauth_data.email:
            new_email = oauth_data.email

            # check if the new email is already taken by another user
            if  User.objects.exclude(pk=user.pk).filter(email=new_email).exists():
                return  LinkedEmailConflict(
                            current_email=user.email,
                            new_email=new_email
                        )

            # safe to update
            user.email  = new_email
            updated     = True

        if  updated:
            user.save(update_fields=['email', 'dispname'])

        return AuthSuccess(user=user)
    else: # No link - new user or conflict - we will fill this in next.
        # 1. check email conflict
        if  User.objects.filter(email=oauth_data.email).exists():
            return EmailConflict(email=oauth_data.email)

        # 2. check username conflict
        if  User.objects.filter(username=oauth_data.username).exists():
            return  UsernameConflict(
                        username=oauth_data.username,
                        oauth_data=oauth_data
                    )
        
        # 3. create user and link
        try:
            user = User.objects.create(
                username=oauth_data.username,
                email=oauth_data.email,
                dispname=oauth_data.dispname or oauth_data.username,
            )

            OAuthLink.objects.create(
                user=user,
                provider=provider,
                provider_unique_id=oauth_data.provider_id,
            )

            return AuthSuccess(user=user)
        except IntegrityError:
            # Race conditions: another request just create the same email/username
            # Determine which one caused the conflict and return the correct type
            if  User.objects.filter(email=oauth_data.email).exists():
                return  EmailConflict(email=oauth_data.email)
            
            return  UsernameConflict(
                        username=oauth_data.username,
                        oauth_data=oauth_data,
                    )


def resolve_username_conflict(username: str, oauth_data: dict, provider: str):
    """
    Create a user and OAuthLink with a chosen username.

    The caller must have already validated the username format and
    ensured that ``oauth_data`` contains the keys ``"email"`` and
    ``"provider_id"``.

    Returns the new User instance.
    Raises ValueError if the username is already taken.
    """
    try:
        with    transaction.atomic():
                user = User.objects.create(
                    username=username,
                    email=oauth_data["email"],
                    dispname=oauth_data.get("dispname") or username,
                )

                OAuthLink.objects.create(
                    user=user,
                    provider=provider,
                    provider_unique_id=oauth_data["provider_id"],
                )
                
                return user
    except IntegrityError:
        # The unique constraint on username or OAuthLink could be violated.
        if  User.objects.filter(username=username).exists():
            raise ValueError("Username already taken.")
        # if OAuthlink already exists (extremely unlikely), re-raise
        raise

