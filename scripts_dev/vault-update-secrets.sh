#!/usr/bin/env bash
set -euo pipefail

# Update Vault secrets from .env.secrets.enc without rebuilding.
# Usage: sudo ./scripts_dev/vault-update-secrets.sh

read -s -p "Vault bootstrap passphrase: " P
echo
echo "⏳ Updating Vault secrets..."

export PASSPHRASE="$P"
ROOT_TOKEN=$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
    -in vault/secrets/vault-bootstrap.enc -pass env:PASSPHRASE | jq -r .root_token)

openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
    -in .env.secrets.enc -pass env:PASSPHRASE -out /dev/shm/trans-update.env
PASSPHRASE=""
P=""

if [ -z "$ROOT_TOKEN" ] || [ "$ROOT_TOKEN" = "null" ]; then
    echo "❌ Could not extract root token."
    exit 1
fi

chmod 600 /dev/shm/trans-update.env
trap 'rm -f /dev/shm/trans-update.env' EXIT
. /dev/shm/trans-update.env

vlt() {
    docker exec -e VAULT_ADDR=https://127.0.0.1:8200 \
                -e VAULT_SKIP_VERIFY=true \
                -e VAULT_TOKEN="$ROOT_TOKEN" \
                trans_vault vault "$@"
}

if [ -n "${SECRET_KEY:-}" ]; then
    vlt kv put secret/django secret_key="$SECRET_KEY"
    echo "  ✅ secret/django updated."
fi

if [ -n "${DB_SERVER_USER:-}" ] && [ -n "${DB_SERVER_PASS:-}" ]; then
    vlt kv put secret/database user="$DB_SERVER_USER" password="$DB_SERVER_PASS"
    echo "  ✅ secret/database updated."
fi

if [ -n "${MONITOR_PASS:-}" ]; then
    vlt kv put secret/monitoring pg_monitor_password="$MONITOR_PASS"
    echo "  ✅ secret/monitoring updated."
fi

if [ -n "${RESTIC_PASSWORD:-}" ]; then
    vlt kv put secret/backup restic_password="$RESTIC_PASSWORD"
    echo "  ✅ secret/backup updated."
fi

if [ -n "${FT_CLIENT_ID:-}" ] && [ -n "${FT_CLIENT_SECRET:-}" ]; then
    vlt kv put secret/oauth/42 client_id="$FT_CLIENT_ID" client_secret="$FT_CLIENT_SECRET"
    echo "  ✅ secret/oauth/42 updated."
fi

if [ -n "${GOOGLE_CLIENT_ID:-}" ] && [ -n "${GOOGLE_CLIENT_SECRET:-}" ]; then
    vlt kv put secret/oauth/google client_id="$GOOGLE_CLIENT_ID" client_secret="$GOOGLE_CLIENT_SECRET"
    echo "  ✅ secret/oauth/google updated."
fi

echo "🔄 Restarting Django to pick up new secrets..."
docker compose up -d --force-recreate --no-deps backend_django

echo "✅ Done. Secrets updated and Django restarted."

