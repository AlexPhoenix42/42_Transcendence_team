#open_auth/providers/__init__.py

from .forty_two     import FortyTwoProvider
from .google        import GoogleProvider

oauth_providers = {
    "42"        : FortyTwoProvider(),
    "google"    : GoogleProvider(),
}


def get_provider(name: str):
    from django.http import Http404
    if  name not in oauth_providers:
        raise Http404(f"Unknown provider '{name}'")

    return oauth_providers[name]

