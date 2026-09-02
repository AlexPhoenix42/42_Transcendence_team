# open_auth/oauth_state.py

import secrets
from django.http import HttpRequest

AOUTH_STATE_KEY_PREFIX = "aouth_state_"

def generate_state(request: HttpRequest, provider: str) -> str:
    state = secrets.token_urlsafe(32)

    request.session[f"{AOUTH_STATE_KEY_PREFIX}{provider}"] = state

    return state


def check_state(request: HttpRequest, provider: str, returned_state: str) -> bool:
    key     = f"{AOUTH_STATE_KEY_PREFIX}{provider}"
    stored  = request.session.pop(key, None)
    if  not stored:
        return False

    return secrets.compare_digest(stored, returned_state)

