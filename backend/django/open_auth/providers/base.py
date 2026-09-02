# open_auth/providers/base.py

from abc import ABC, abstractmethod

from dataclasses import dataclass

@dataclass(frozen=True)
class OAuthUserData:
    provider_id : str # e.g. instra_id or google_id
    email       : str
    username    : str
    dispname    : str


class BaseOAuthProvider(ABC):
    @abstractmethod
    def get_authorization_url(self, state: str) -> str:
        """Return the full URL to redirect the browser to the providers login page."""
        ...

    @abstractmethod
    def exchange_code(self, code: str) -> str:
        """Exchange an authorization code for an access token. Returns the token"""
        ...

    @abstractmethod
    def get_user_info(self, access_token: str) -> OAuthUserData:
        """Use the access token to fetch user info. Return it in standard form"""
        ...

