# oauth_config.py

import os

from config.vault import get_vault_secret


#REQUIRED_ENV_VARS = [
#    'FT_CLIENT_ID', 'FT_CLIENT_SECRET', 'FT_REDIRECT_URI',
#    'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI',
#    'FRONTEND_URL',
#]

def load_oauth_config():
    config = {}

    # OAuth client credentials come from Vault
    config["FT_CLIENT_ID"]          = get_vault_secret("oauth/42", "client_id")
    config["FT_CLIENT_SECRET"]      = get_vault_secret("oauth/42", "client_secret")
    config["GOOGLE_CLIENT_ID"]      = get_vault_secret("oauth/google", "client_id")
    config["GOOGLE_CLIENT_SECRET"]  = get_vault_secret("oauth/google", "client_secret")

    # Non-secret OAuth values still comes from plain .env
    config["FT_REDIRECT_URI"]       = os.environ.get("FT_REDIRECT_URI")
    config["GOOGLE_REDIRECT_URI"]   = os.environ.get("GOOGLE_REDIRECT_URI")
    config["FRONTEND_URL"]          = os.environ.get("FRONTEND_URL")

    for var in ("FT_REDIRECT_URI", "GOOGLE_REDIRECT_URI", "FRONTEND_URL"):
        if  not config[var]:
            raise RuntimeError(f"Missing required env var: {var}")

    return config

    #for var in REQUIRED_ENV_VARS:
    #    val = os.environ.get(var)
    #    if  not val:
    #        raise RuntimeError(f"Missing required env var: {var}")
    #    config[var] = val
    #return  config

oauth_config = load_oauth_config()

