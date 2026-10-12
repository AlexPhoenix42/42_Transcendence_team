#!/usr/bin/env bash
set -e

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required but not installed. Install it and try again."
    exit 1
fi

COMPOSE_FILE="../docker-compose.yml"
MD_KEYS_FILE="../vault/secrets/tokens.md"
JSON_KEYS_FILE="../vault/secrets/tokens.json"
DATA_DIR="../vault/data"

# Kill background jobs and any log tail processes
trap 'kill $(jobs -p) 2>/dev/null; pkill -f "logs -f vault" 2>/dev/null || true' EXIT

echo "🔄 Starting Vault container..."
docker compose -f "$COMPOSE_FILE" up -d vault

echo "⏳ Waiting for Vault to be ready (watching logs)..."
docker compose -f "$COMPOSE_FILE" logs -f vault &
sleep 2

until docker compose -f "$COMPOSE_FILE" logs vault 2>&1 | grep -q "Vault server started!"; do
    sleep 2
done
echo "✅ Vault is ready."

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
    if [ ! -f "$JSON_KEYS_FILE" ] && [ ! -f "$MD_KEYS_FILE" ]; then
        echo "⚠️  Keys files missing! Re‑initialising Vault (no secrets stored yet)."
        docker compose -f "$COMPOSE_FILE" down vault
        rm -rf "$DATA_DIR"
        docker compose -f "$COMPOSE_FILE" up -d vault
        until docker compose -f "$COMPOSE_FILE" logs vault 2>&1 | grep -q "Vault server started!"; do
            sleep 2
        done
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
        echo "✅ Vault re‑initialised. Keys saved to $MD_KEYS_FILE and $JSON_KEYS_FILE."
    fi
fi

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

# ✅ Fixed loop with timeout
echo "⏳ Waiting for Vault to become active (Raft election)..."
attempt=0
max_attempts=30
while [ $attempt -lt $max_attempts ]; do
    status_output=$(docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem vault vault status -format=json 2>&1)
    if [ $? -eq 0 ] && echo "$status_output" | jq -e '.ha_enabled and (.active_node_address != null and .active_node_address != "<none>")' > /dev/null 2>&1; then
        echo "✅ Vault is active."
        break
    fi
    attempt=$((attempt+1))
    sleep 2
done
if [ $attempt -eq $max_attempts ]; then
    echo "⚠️  Vault did not become active within timeout. Proceeding anyway (it may already be active)."
fi

ROOT_TOKEN=$(jq -r '.root_token' "$JSON_KEYS_FILE" 2>/dev/null || echo "")
if [ -z "$ROOT_TOKEN" ]; then
    echo "❌ Could not find root token."
    exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem -e VAULT_TOKEN="$ROOT_TOKEN" vault vault secrets list -format=json | jq -e '.["secret/"]' > /dev/null; then
    echo "📦 Enabling KV v2 secrets engine at secret/..."
    docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem -e VAULT_TOKEN="$ROOT_TOKEN" vault vault secrets enable -path=secret kv-v2
else
    echo "✅ KV v2 secrets engine already enabled."
fi

echo "🎯 Vault initialisation and unsealing complete."

