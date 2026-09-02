# open_auth/state.py

# Deprecated.

import secrets
from django.http import HttpRequest

def generate_state(request: HttpRequest, provider: str) -> str:
    state = secrets.token_urlsafe(32)
    
    # store it in session with a key like "oauth_state_42"
    request.session[f"oauth_state_{provider}"] = state

    return state



def validate_state(request: HttpRequest, provider: str, returned_state: str) -> bool:
    stored_state = request.session.pop(f"oauth_state_{provider}", None)
    if  not stored_state:
        return  False
    
    return  secrets.compare_digest(stored_state, returned_state)









