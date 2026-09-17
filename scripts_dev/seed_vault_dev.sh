#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────
#  seed_vault_dev.sh — seed the DEV vault, from INSIDE the vault container.
#
#  Why this exists:
#    seed_vault.sh is a HOST script. It shells out to `docker compose exec`,
#    needs jq, reads ../vault/secrets/tokens.json and targets the *dep*
#    compose file. docker-compose-dev.yml mounts it into a hashicorp/vault
#    container and runs it there, where there is no docker CLI and no jq —
#    so it exits non-zero, and backend_django (which waits on
#    service_completed_successfully) never starts.
#
#    This version talks to Vault directly with the vault CLI that ships in
#    the image, using dev mode's root token over http.
#
#  settings.py calls get_vault_secret() at import time for all four paths
#  below, and vault.py raises KeyError on a missing path — so every one of
#  them must exist or Django dies before serving a request.
# ─────────────────────────────────────────────────────────────────────────
set -eu

VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"
export VAULT_ADDR

echo "⏳ waiting for vault at ${VAULT_ADDR} ..."
i=0
until vault status >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then
        echo "❌ vault did not become ready after 120s"
        vault status || true
        exit 1
    fi
    sleep 2
done
echo "✅ vault is unsealed and reachable"

# Dev mode mounts KV v2 at secret/ automatically.
echo "📦 seeding secrets ..."

vault kv put secret/django \
    secret_key="${SECRET_KEY:?SECRET_KEY missing from .env}" >/dev/null
echo "   ✓ secret/django"

vault kv put secret/database \
    user="${DB_SERVER_USER:?DB_SERVER_USER missing from .env}" \
    password="${DB_SERVER_PASS:?DB_SERVER_PASS missing from .env}" >/dev/null
echo "   ✓ secret/database"

# Placeholders are fine — they only need to exist so settings.py can import.
vault kv put secret/oauth/42 \
    client_id="${FT_CLIENT_ID:-dev-placeholder}" \
    client_secret="${FT_CLIENT_SECRET:-dev-placeholder}" >/dev/null
echo "   ✓ secret/oauth/42"

vault kv put secret/oauth/google \
    client_id="${GOOGLE_CLIENT_ID:-dev-placeholder}" \
    client_secret="${GOOGLE_CLIENT_SECRET:-dev-placeholder}" >/dev/null
echo "   ✓ secret/oauth/google"

echo "✅ vault seeded — django can start"
