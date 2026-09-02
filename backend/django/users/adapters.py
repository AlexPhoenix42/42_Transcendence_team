#import logging
#from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
#
#logger = logging.getLogger(__name__)
#
#class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
#    def populate_user(self, request, sociallogin, data):
#        user = super().populate_user(request, sociallogin, data)
#        logger.debug(f"Populated user: username={user.username}, email={user.email}")
#        # Ensure username is set
#        if  not user.username and user.email:
#            user.username = user.email.split('@')[0]
#
#        return user
#

import logging
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter

print("=== users.adapters.py IS IMPORTED ===")

logger = logging.getLogger(__name__)

class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    def __init__(self, *args, **kwargs):
        print("=== CUSTOM SOCIAL ACCOUNT ADAPTER INSTANTIATED ===")
        super().__init__(*args, **kwargs)

    def populate_user(self, request, sociallogin, data):
        print("=== CUSTOM ADAPTER: populate_user called ===")
        print(f"Data from Google: {data}")
        user = super().populate_user(request, sociallogin, data)
        print(f"Username: {user.username}, Email: {user.email}")
        if not user.username and user.email:
            user.username = user.email.split('@')[0]
            print(f"Username set to: {user.username}")
        return user

    def pre_social_login(self, request, sociallogin):
        print("=== CUSTOM ADAPTER: pre_social_login called ===")
        print(f"Extra data: {sociallogin.account.extra_data}")
        super().pre_social_login(request, sociallogin)

