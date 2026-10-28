# open_auth/providers/google.py

import requests

from urllib.parse       import urlencode
from ..oauth_config     import oauth_config
from .base              import BaseOAuthProvider, OAuthUserData
from .exceptions        import TokenExchangeError, UserInfoError

class GoogleProvider(BaseOAuthProvider):
    def get_authorization_url(self, state: str) -> str:
        args = {
            "client_id"     : oauth_config["GOOGLE_CLIENT_ID"],
            "redirect_uri"  : oauth_config["GOOGLE_REDIRECT_URI"],
            "response_type" : "code",
            "scope"         : "email profile",
            "access_type"   : "online",
            "state"         : state,
            "prompt"        : "select_account",
            #"prompt"        : "consent", # force re-authentication
        }

        base  = "https://accounts.google.com/o/oauth2/v2/auth"
        return base + "?" + urlencode(args)

    def exchange_code(self, code: str) -> str:
        data = {
            "grant_type"        : "authorization_code",
            "client_id"         : oauth_config["GOOGLE_CLIENT_ID"],
            "client_secret"     : oauth_config["GOOGLE_CLIENT_SECRET"],
            "redirect_uri"      : oauth_config["GOOGLE_REDIRECT_URI"],
            "code"              : code,
        }

        try:
            resp = requests.post("https://oauth2.googleapis.com/token", data=data, timeout=10)
        except requests.exceptions.Timeout:
            raise TokenExchangeError("Google token endpoint timed out.")

        if  resp.status_code != 200:
            raise TokenExchangeError(f"Google token endpoint returned {resp.status_code}")

        access_token = resp.json().get("access_token")
        if  not access_token:
            raise TokenExchangeError("access_token is missing from Google response.")

        return access_token

    def get_user_info(self, access_token: str) -> OAuthUserData:
        headers = {"Authorization": f"Bearer {access_token}"}

        try:
            resp    = requests.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers=headers, timeout=10) 
        except requests.exceptions.Timeout:
            raise UserInfoError("Google userinfo endpoint timed out.")
        if  resp.status_code != 200:
            raise UserInfoError(f"Google userinfo endpoint returned {resp.status_code}")

        data        = resp.json()
        google_id   = data.get("id")
        email       = data.get("email")
        name        = data.get("name", "")

        if  not google_id or not email:
            raise UserInfoError("Incomplete user data from Google.")

        # Google doesnt provide a seprate username; extract from email
        username    = email.split("@")[0]

        return OAuthUserData(
            provider_id=str(google_id),
            email=email,
            username=username,
            dispname=name or username,
        )

