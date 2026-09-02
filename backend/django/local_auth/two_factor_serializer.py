# local_auth/two_factor_serializer.py

from __future__                                 import annotations
from typing                                     import TYPE_CHECKING, cast

from django.contrib.auth                        import get_user_model
from rest_framework_simplejwt.serializers       import TokenObtainPairSerializer

from rest_framework                             import serializers

from django.core.cache                          import cache

from django.utils                               import timezone

from two_factor_auth.models                     import TOTPDevice

from django.contrib.auth                        import login

from datetime                                   import timedelta

import uuid

if  TYPE_CHECKING:
    from users.models import User as User   # noqa: PLC0414
else:
    from django.contrib.auth import get_user_model
    User = get_user_model()


class TwoFactorTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        # Run the default validation (checks username/password)
        data = super().validate(attrs)
        user = cast(User, self.user)

        # -- Account status check ---
        if  not user.is_active:
            raise serializers.ValidationError(
                "Account is deactivated.",
                code="account_deactivated",
            )

        if  not user.email_verfd:   # noqa: SIM102
            if timezone.now() - user.date_joined > timedelta(days=3):
                raise serializers.ValidationError(
                    "Account frozen. please verify your email.",
                    code="account_frozen",
                )
        # ----------------------------------------

        # If the user has 2FA enabled, override the response
        if  TOTPDevice.objects.filter(user=user, is_active=True).exists():
            tmp_token = str(uuid.uuid4())

            cache.set(
                f"2fa_tmp_token:{tmp_token}",
                user.pk,
                timeout=60,
            )

            return {
                "tmp_token"     : tmp_token,
                "requires_2fa"  : True,
            }

        # Authenticate session for WebSocket
        request = self.context.get("request")
        if  request:
            user.backend = 'django.contrib.auth.backends.ModelBackend'
            login(request, user)
            user.is_online = True
            user.save(update_fields=["is_online"])
        
        #return data # normal JWT response

        data["user"] = {    # type: ignore[assignment]
            "id"        : user.pk,
            "username"  : user.username,
            "email"     : user.email
        }
        return data

