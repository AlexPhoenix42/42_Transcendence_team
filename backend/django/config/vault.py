# config/vault.py

import os

import hvac

import json

from hvac.exceptions    import InvalidPath

import logging

logger = logging.getLogger(__name__)

VAULT_ADDR          = os.environ.get('VAULT_URL', 'http://vault:8200')
VAULT_AUTH_METHOD   = os.environ.get('VAULT_AUTH_METHOD', 'token') # 'token' or 'approle'

# For dev (token) must be explicitly set
VAULT_TOKEN         = os.environ.get('VAULT_TOKEN')  # no default fallback

# For production (AppRole) must be explicitly set
VAULT_ROLE_ID       = os.environ.get('VAULT_ROLE_ID')
VAULT_SECRET_ID     = os.environ.get('VAULT_SECRET_ID')

_secret_cache: dict[str, str] = {}
_client_cache: hvac.Client | None = None

def _get_approle_credentials_from_file():
    cred_file = "/vault/approle/credentials.json"
    if  os.path.exists(cred_file):
        try:
            with open(cred_file) as f:
                data = json.load(f)
                return data.get("role_id"), data.get("secret_id")

        except Exception as e:
            logger.warning("Failed to read AppRole credentials from file: %s", e)

    return None, None

def get_vault_client():
    """Create and authenticate a Vault client based on the selected method."""
    verify = os.environ.get('VAULT_CACERT', True)
    # If verify is a string, ensure the file exists
    if  isinstance(verify, str) and not os.path.exists(verify):
        logger.warning("VAULT_CACERT file %s not found, falling back to insecure", verify)
        verify = False  # only for dev; comment in production

    client = hvac.Client(url=VAULT_ADDR, timeout=30, verify=verify)

    if  VAULT_AUTH_METHOD == 'token':
        if  not VAULT_TOKEN:
            raise RuntimeError("VAULT_TOKEN must be set when using token auth.")

        client.token = VAULT_TOKEN
        if  not client.is_authenticated():
            raise RuntimeError("Vault token authentication failed.")

        return client

    elif VAULT_AUTH_METHOD == 'approle':
        role_id     = VAULT_ROLE_ID
        secret_id   = VAULT_SECRET_ID

        # If env vars are empty, try the file
        if  not role_id or not secret_id:
            role_id, secret_id = _get_approle_credentials_from_file()

        if  not role_id or not secret_id:
            raise RuntimeError("AppRole credentials not found (neither env nor file).")

        #if  not VAULT_ROLE_ID or not VAULT_SECRET_ID:
        #    raise RuntimeError("VAULT_ROLE_ID and VAULT_SECRET_ID must be set.")

        try:
            #client.auth.approle.login(role_id=VAULT_ROLE_ID, secret_id=VAULT_SECRET_ID)
            client.auth.approle.login(role_id=role_id, secret_id=secret_id)

        except Exception as e:
            logger.error("Vault AppRole login failed: %s", e)
            raise RuntimeError("Vault authentication failed.")

        if  not client.is_authenticated():
            raise RuntimeError("Vault not authenticated after AppRole login")

        return client

    else:
        raise ValueError(f"Unsupported VAULT_AUTH_METHOD: {VAULT_AUTH_METHOD}")

def get_vault_secret(path, key, force_refresh=False):
    """
    Retrieve a secret from Vault's KV v2 store.
    Cached per process.
    """
    global _client_cache

    cache_key   = f"{path}:{key}"
    if  not force_refresh and cache_key in _secret_cache:
        return _secret_cache[cache_key]

    if  _client_cache is None or not _client_cache.is_authenticated():
        _client_cache = get_vault_client()

    try:
        resp    = _client_cache.secrets.kv.v2.read_secret_version(path=path)
        value   = resp['data']['data'].get(key)
        if  value is None:
            raise KeyError(f"Key '{key}' not found in secret path '{path}'.")

        _secret_cache[cache_key] = value

        return value

    except InvalidPath:
        logger.error("Secret path '%s' not found", path)
        raise KeyError(f"Secret path '{path}' not found")

    except Exception as e:
        logger.error(
            "Vault read failed for path '%s', key '%s': %s", path, key, e)
        raise RuntimeError(f"Vault error: {e}.")

#def get_vault_secret(path, key, force_refresh=False):
#    """
#    Retrieve a secret from Vault's KV v2 store.
#    Cached per process.
#    """
#    #return "tmp"    # this to bypass crash during migration. must comment after migration.
#
#    cache_key   = f"{path}:{key}"
#    if  not force_refresh and cache_key in _secret_cache:
#        return _secret_cache[cache_key]
#
#    client      = get_vault_client()
#
#    try:
#        resp    = client.secrets.kv.v2.read_secret_version(path=path)
#        value   = resp['data']['data'].get(key)
#        if  value is None:
#            raise KeyError(f"Key '{key}' not found in secret path '{path}'.")
#
#        _secret_cache[cache_key] = value
#
#        return value
#
#    except InvalidPath:
#        logger.error("Secret path '%s' not found", path)
#        raise KeyError(f"Secret path '{path}' not found")
#
#    except Exception as e:
#        logger.error(
#            "Vault read failed for path '%s', key '%s': %s", path, key, e)
#        raise RuntimeError(f"Vault error: {e}.")

