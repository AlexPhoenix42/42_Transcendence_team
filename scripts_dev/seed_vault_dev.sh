#!/bin/sh
set -e

ENV_FILE=/app/.env

if [ ! -f "$ENV_FILE" ]; then
    echo "no .env file found at $ENV_FILE"
    exit 1
fi
set -a
. "$ENV_FILE"
set +a

echo "waiting for vault..."
until vault status >/dev/null 2>&1; do
    sleep 1
done
echo "vault is ready"

echo "storing secrets in vault..."

vault kv put secret/django \
    secret_key="$SECRET_KEY"

vault kv put secret/database \
    user="$DB_SERVER_USER" password="$DB_SERVER_PASS"

vault kv put secret/oauth/42 \
    client_id="${FT_CLIENT_ID:-placeholder_ft_client_id}" \
    client_secret="${FT_CLIENT_SECRET:-placeholder_ft_client_secret}"

vault kv put secret/oauth/google \
    client_id="${GOOGLE_CLIENT_ID:-placeholder_google_client_id}" \
    client_secret="${GOOGLE_CLIENT_SECRET:-placeholder_google_client_secret}"

echo "all secrets stored successfully."
