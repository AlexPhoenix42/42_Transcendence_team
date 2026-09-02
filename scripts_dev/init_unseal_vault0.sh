#!/usr/bin/env bash
set -e

COMPOSE_FILE="../docker-compose-dep.yml"
MD_KEYS_FILE="../vault/tokens.md"
JSON_KEYS_FILE="../vault/tokens.json"

# 1. Start Vault in detached mode
echo "🔄 Starting Vault container..."
docker compose -f "$COMPOSE_FILE" up -d vault

# 2. Show logs in background while waiting
echo "⏳ Waiting for Vault to be ready (watching logs)..."
docker compose -f "$COMPOSE_FILE" logs -f vault &
LOG_PID=$!

# 3. Wait until "Vault server started!" appears in logs
until docker compose -f "$COMPOSE_FILE" logs vault 2>&1 | grep -q "Vault server started!"; do
    sleep 2
done

# 4. Stop following logs
kill $LOG_PID 2>/dev/null || true
echo "✅ Vault is ready."

# 5. Check if Vault is already initialised
INIT_STATUS=$(docker compose -f "$COMPOSE_FILE" exec -T vault vault status -format=json | jq -r '.initialized')

if [ "$INIT_STATUS" = "false" ]; then
    echo "🔐 Initialising Vault..."

    # Run init and capture JSON output
    JSON_OUTPUT=$(docker compose -f "$COMPOSE_FILE" exec -T vault vault operator init -format=json)

    # Save JSON to file for script use
    echo "$JSON_OUTPUT" > "$JSON_KEYS_FILE"
    echo "✅ JSON keys saved to $JSON_KEYS_FILE"

    # Generate human‑readable version and save to tokens.md
    echo "📝 Writing human‑readable keys to $MD_KEYS_FILE ..."
    {
        echo "Unseal Keys:"
        echo "$JSON_OUTPUT" | jq -r '.unseal_keys_b64[]' | nl -w1 -s'. ' | sed 's/^/  /'
        echo
        echo "Root Token:"
        echo "$JSON_OUTPUT" | jq -r '.root_token'
        echo
        echo "Vault initialized with $(echo "$JSON_OUTPUT" | jq -r '.unseal_keys_b64 | length') key shares and a key threshold of 3."
    } > "$MD_KEYS_FILE"

    echo "✅ Vault initialised. Keys saved to $MD_KEYS_FILE (human) and $JSON_KEYS_FILE (JSON)."
else
    echo "ℹ️ Vault is already initialised."
fi

# 6. Check if Vault is sealed
SEAL_STATUS=$(docker compose -f "$COMPOSE_FILE" exec -T vault vault status -format=json | jq -r '.sealed')

if [ "$SEAL_STATUS" = "true" ]; then
    echo "🔓 Unsealing Vault..."

    # If JSON file is missing but the markdown file exists, try to convert it
    if [ ! -f "$JSON_KEYS_FILE" ] && [ -f "$MD_KEYS_FILE" ]; then
        echo "⚠️  JSON keys file not found. Attempting to convert $MD_KEYS_FILE to JSON..."
        # Extract keys and token from the markdown file (assumes the format we just wrote)
        keys=$(grep -E '^[0-9]+\.' "$MD_KEYS_FILE" | sed 's/^[0-9]\+\. //' | jq -R -s 'split("\n") | map(select(length>0))')
        root=$(grep -E '^Root Token:' "$MD_KEYS_FILE" | sed 's/^Root Token: //')
        # Build the JSON structure that the script expects
        jq -n --argjson keys "$keys" --arg root "$root" '{ unseal_keys_b64: $keys, root_token: $root }' > "$JSON_KEYS_FILE"
        echo "✅ Converted $MD_KEYS_FILE to $JSON_KEYS_FILE"
    fi

    if [ ! -f "$JSON_KEYS_FILE" ]; then
        echo "❌ No keys file found. Cannot unseal."
        exit 1
    fi

    # Unseal with first 3 keys (threshold = 3)
    for i in {0..2}; do
        KEY=$(jq -r ".unseal_keys_b64[$i]" < "$JSON_KEYS_FILE")
        docker compose -f "$COMPOSE_FILE" exec -T vault vault operator unseal "$KEY"
    done
    echo "✅ Vault is now unsealed."
else
    echo "ℹ️ Vault is already unsealed."
fi

# Enable KV v2 at secret/ if not already present
if ! docker compose exec -T vault vault secrets list -format=json | jq -e '.["secret/"]' > /dev/null; then
    echo "📦 Enabling KV v2 secrets engine at secret/..."
    docker compose exec -T vault vault secrets enable -path=secret kv-v2
fi

echo "🎯 Vault initialisation and unsealing complete."

