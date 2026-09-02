# open_auth/providers/forty_two.py

import requests

from ..oauth_config   import oauth_config
from .base          import BaseOAuthProvider, OAuthUserData
from .exceptions    import TokenExchangeError, UserInfoError

from urllib.parse   import urlencode


class FortyTwoProvider(BaseOAuthProvider):

    def get_authorization_url(self, state: str) -> str:
        args    = {
            "client_id"     : oauth_config["FT_CLIENT_ID"],
            "redirect_uri"  : oauth_config["FT_REDIRECT_URI"],
            "response_type" : "code",
            "state"         : state,
        }

        base    = "https://api.intra.42.fr/oauth/authorize" 
        return base + "?" + urlencode(args)


    def exchange_code(self, code: str) -> str:
        data = {
            "grant_type"    : "authorization_code",
            "client_id"     : oauth_config["FT_CLIENT_ID"],
            "client_secret" : oauth_config["FT_CLIENT_SECRET"],
            "redirect_uri"  : oauth_config["FT_REDIRECT_URI"],
            "code"          : code,
        }

        try:
            resp = requests.post("https://api.intra.42.fr/oauth/token", data=data, timeout=10)
        except requests.exceptions.Timeout:
            raise TokenExchangeError("42 token endpoint timed out.")
        if  resp.status_code != 200:
            raise TokenExchangeError(f"42 token endpoint returned {resp.status_code}")

        payload         = resp.json()
        access_token    = payload.get("access_token")
        if  not access_token:
            raise TokenExchangeError("access_token missing from 42 response")

        return access_token


    def get_user_info(self, access_token: str) -> OAuthUserData:
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            resp    = requests.get("https://api.intra.42.fr/v2/me", headers=headers, timeout=10)
        except requests.exceptions.Timeout:
            raise TokenExchangeError("42 token endpoint timed out.")
        if  resp.status_code != 200:
            raise UserInfoError(f"42 userinfo endpoint returned {resp.status_code}")

        data        = resp.json()
        intra_id    = data.get("id")
        email       = data.get("email")
        login       = data.get("login")
        dispname    = data.get("displayname")

        if  not intra_id or not email or not login:
            raise UserInfoError("Incomplete user data from 42")

        return  OAuthUserData(
                    provider_id=str(intra_id),
                    email=email,
                    username=login,
                    dispname=dispname or login,
                )

