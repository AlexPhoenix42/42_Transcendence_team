from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from django.http import HttpRequest

class DynamicGoogleOAuth2Adapter(GoogleOAuth2Adapter):
    def get_redirect_uri(self, request: HttpRequest) -> str:
        return  request.build_absolute_uri('/accounts/google/login/callback/')

