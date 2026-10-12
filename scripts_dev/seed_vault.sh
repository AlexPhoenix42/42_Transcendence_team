#!/usr/bin/env bash
set -e

# ── Config ────────────────────────────────────────────────────────────────
COMPOSE_FILE="../docker-compose.yml"
JSON_KEYS_FILE="../vault/secrets/tokens.json"
ENV_FILE="../.env"

# ── Check if jq is installed ─────────────────────────────────────────────
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required. Install it and try again."
    exit 1
fi

# ── Load .env ─────────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env file not found at $ENV_FILE"
    exit 1
fi
set -a
source "$ENV_FILE"
set +a

# ── Get root token ──────────────────────────────────────────────────────
if [ ! -f "$JSON_KEYS_FILE" ]; then
    echo "❌ Keys file not found. Run init_unseal_vault.sh first."
    exit 1
fi
ROOT_TOKEN=$(jq -r '.root_token' "$JSON_KEYS_FILE")
if [ -z "$ROOT_TOKEN" ]; then
    echo "❌ Could not read root token from $JSON_KEYS_FILE."
    exit 1
fi

# ── Wait for Vault ─────────────────────────────────────────────────────
echo "⏳ Waiting for Vault to be ready..."
until docker compose -f "$COMPOSE_FILE" exec -T vault vault status &>/dev/null; do
    sleep 2
done
echo "✅ Vault is ready."

# ── Store secrets ──────────────────────────────────────────────────────
echo "📦 Storing secrets in Vault..."

docker compose -f "$COMPOSE_FILE" exec -T \
    -e VAULT_CACERT=/vault/certs/ca-cert.pem \
    -e VAULT_TOKEN="$ROOT_TOKEN" \
    vault vault kv put secret/django secret_key="$SECRET_KEY"

docker compose -f "$COMPOSE_FILE" exec -T \
    -e VAULT_CACERT=/vault/certs/ca-cert.pem \
    -e VAULT_TOKEN="$ROOT_TOKEN" \
    vault vault kv put secret/database \
        user="$DB_SERVER_USER" password="$DB_SERVER_PASS"

docker compose -f "$COMPOSE_FILE" exec -T \
    -e VAULT_CACERT=/vault/certs/ca-cert.pem \
    -e VAULT_TOKEN="$ROOT_TOKEN" \
    vault vault kv put secret/oauth/42 \
        client_id="$FT_CLIENT_ID" client_secret="$FT_CLIENT_SECRET"

docker compose -f "$COMPOSE_FILE" exec -T \
    -e VAULT_CACERT=/vault/certs/ca-cert.pem \
    -e VAULT_TOKEN="$ROOT_TOKEN" \
    vault vault kv put secret/oauth/google \
        client_id="$GOOGLE_CLIENT_ID" client_secret="$GOOGLE_CLIENT_SECRET"

echo "✅ All secrets stored successfully."

