#!/usr/bin/env bash
set -e

COMPOSE_FILE="../docker-compose-dep.yml"
MD_KEYS_FILE="../vault/tokens.md"
JSON_KEYS_FILE="../vault/tokens.json"

# Cleanup background logs on exit
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT

echo "🔄 Starting Vault container..."
docker compose -f "$COMPOSE_FILE" up -d vault

echo "⏳ Waiting for Vault to be ready (watching logs)..."
docker compose -f "$COMPOSE_FILE" logs -f vault &
sleep 2  # give logs a moment to start

until docker compose -f "$COMPOSE_FILE" logs vault 2>&1 | grep -q "Vault server started!"; do
    sleep 2
done
echo "✅ Vault is ready."

# Check initialisation (with CA cert)
INIT_STATUS=$(docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem vault vault status -format=json | jq -r '.initialized')

if [ "$INIT_STATUS" = "false" ]; then
    echo "🔐 Initialising Vault..."
    JSON_OUTPUT=$(docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem vault vault operator init -format=json)
    echo "$JSON_OUTPUT" > "$JSON_KEYS_FILE"
    {
        echo "Unseal Keys:"
        echo "$JSON_OUTPUT" | jq -r '.unseal_keys_b64[]' | nl -w1 -s'. ' | sed 's/^/  /'
        echo
        echo "Root Token:"
        echo "$JSON_OUTPUT" | jq -r '.root_token'
        echo
        echo "Vault initialized with $(echo "$JSON_OUTPUT" | jq -r '.unseal_keys_b64 | length') key shares and a key threshold of 3."
    } > "$MD_KEYS_FILE"
    echo "✅ Vault initialised. Keys saved to $MD_KEYS_FILE and $JSON_KEYS_FILE."
else
    echo "ℹ️ Vault is already initialised."
fi

# Check if sealed (with CA cert)
SEAL_STATUS=$(docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem vault vault status -format=json | jq -r '.sealed')

if [ "$SEAL_STATUS" = "true" ]; then
    echo "🔓 Unsealing Vault..."
    if [ ! -f "$JSON_KEYS_FILE" ]; then
        echo "❌ No keys file. Cannot unseal."
        exit 1
    fi
    for i in {0..2}; do
        KEY=$(jq -r ".unseal_keys_b64[$i]" < "$JSON_KEYS_FILE")
        docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem vault vault operator unseal "$KEY"
    done
    echo "✅ Vault is now unsealed."
else
    echo "ℹ️ Vault is already unsealed."
fi

# Extract root token (needed for authenticated commands)
ROOT_TOKEN=$(jq -r '.root_token' "$JSON_KEYS_FILE" 2>/dev/null || echo "")

if [ -z "$ROOT_TOKEN" ]; then
    echo "❌ Could not find root token. Please check $JSON_KEYS_FILE."
    exit 1
fi

# Enable KV engine (authenticated with root token and CA cert)
if ! docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem -e VAULT_TOKEN="$ROOT_TOKEN" vault vault secrets list -format=json | jq -e '.["secret/"]' > /dev/null; then
    echo "📦 Enabling KV v2 secrets engine at secret/..."
    docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem -e VAULT_TOKEN="$ROOT_TOKEN" vault vault secrets enable -path=secret kv-v2
else
    echo "✅ KV v2 secrets engine already enabled."
fi

echo "🎯 Vault initialisation and unsealing complete."

