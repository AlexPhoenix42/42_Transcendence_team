#!/bin/sh
set -e

export VAULT_ADDR="https://vault:8200"
export VAULT_CACERT="/vault/certs/ca-cert.pem"

if ! command -v jq > /dev/null 2>&1; then
    echo "❌ jq is required but not installed."
    exit 1
fi

if [ ! -f /vault/certs/ca-cert.pem ]; then
	echo "🔐 Certificates missing. Generating using your script..."
	sh /app/gen_vault_cert.sh
fi

# Ensure secrets directory exists
mkdir -p /vault/secrets

MD_KEYS_FILE="/vault/secrets/tokens.md"
JSON_KEYS_FILE="/vault/secrets/tokens.json"

echo "⏳ Waiting for Vault to be ready..."
atmpt=0
max_atmpts=30
until vault status > /dev/null 2>&1 || [ $? -eq 2 ]; do
	atmpt=$((atmpt+1))
	if	[ $atmpt -ge $max_atmpts ]; then
		echo "❌ Vault did not become ready within timeout." >&2
		exit 1
	fi
	sleep 2
done

echo "✅ Vault is ready."

INIT_STATUS=$(vault status -format=json | jq -r '.initialized')

if [ "$INIT_STATUS" = "false" ]; then
    echo "🔐 Initialising Vault..."
    JSON_OUTPUT=$(vault operator init -format=json)
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

	chmod 600 "$JSON_KEYS_FILE" "$MD_KEYS_FILE"

    echo "✅ Vault initialised. Keys saved to $MD_KEYS_FILE and $JSON_KEYS_FILE."
else
    echo "ℹ️ Vault is already initialised."
    if [ ! -f "$JSON_KEYS_FILE" ] && [ ! -f "$MD_KEYS_FILE" ]; then
        echo "❌ CRITICAL: Vault is initialized but keys files are missing."
        echo "   Please wipe the Vault volume and restart: docker compose down -v && docker compose up -d"
        exit 1
    fi
fi

SEAL_STATUS=$(vault status -format=json | jq -r '.sealed')

if [ "$SEAL_STATUS" = "true" ]; then
    echo "🔓 Unsealing Vault..."
    if [ ! -f "$JSON_KEYS_FILE" ]; then
        echo "❌ No keys file. Cannot unseal."
        exit 1
    fi

	#THRESHOLD=3

    # ----- FIXED: Read threshold dynamically from Vault -----
    #THRESHOLD=$(vault status -format=json | jq -r '.threshold')
	THRESHOLD=$(jq -r '.unseal_threshold' "$JSON_KEYS_FILE")

    i=0
    while [ $i -lt "$THRESHOLD" ]; do
        KEY=$(jq -r ".unseal_keys_b64[$i]" < "$JSON_KEYS_FILE")
        vault operator unseal "$KEY"
        i=$((i+1))
    done
    echo "✅ Vault is now unsealed."
else
    echo "ℹ️ Vault is already unsealed."
fi

echo "⏳ Waiting for Vault to become active..."
atmpt=0
max_atmpts=30
while [ $atmpt -lt $max_atmpts ]; do
    status_output=$(vault status -format=json 2>&1)
    if [ $? -eq 0 ] && echo "$status_output" | jq -e '.ha_enabled and (.active_node_address != null and .active_node_address != "<none>")' > /dev/null 2>&1; then
        echo "✅ Vault is active."
        break
    fi
    atmpt=$((atmpt+1))
    sleep 2
done
if [ $atmpt -eq $max_atmpts ]; then
    echo "⚠️  Vault did not become active within timeout. Proceeding anyway."
fi

ROOT_TOKEN=$(jq -r '.root_token' "$JSON_KEYS_FILE" 2>/dev/null || echo "")
if [ -z "$ROOT_TOKEN" ]; then
    echo "❌ Could not find root token."
    exit 1
fi

# --- THIS WAS ALSO MISSING ---
export VAULT_TOKEN="$ROOT_TOKEN"

if ! vault secrets list -format=json | jq -e '.["secret/"]' > /dev/null; then
    echo "📦 Enabling KV v2 secrets engine at secret/..."
    vault secrets enable -path=secret kv-v2
else
    echo "✅ KV v2 secrets engine already enabled."
fi

# ---- AppRole setup for Django ----
echo "🔐 Setting up AppRole for Django..."

# Enable AppRole if not already enabled
if ! vault auth list -format=json | jq -e '.["approle/"]' > /dev/null 2>&1; then
    echo "  Enabling AppRole auth method..."
    vault auth enable approle
else
    echo "  AppRole already enabled."
fi

# Create policy if missing
if ! vault policy read django-approle > /dev/null 2>&1; then
    echo "  Creating django-approle policy..."
    vault policy write django-approle - <<EOF
path "secret/data/django"   { capabilities = ["read"] }
path "secret/data/database" { capabilities = ["read"] }
path "secret/data/oauth/*"  { capabilities = ["read"] }
EOF
else
    echo "  Policy already exists."
fi

# Create role if missing
if ! vault read auth/approle/role/django-role > /dev/null 2>&1; then
    echo "  Creating django-role..."
    vault write auth/approle/role/django-role \
        token_policies=django-approle \
        token_ttl=1h \
        token_max_ttl=4h
else
    echo "  Role already exists."
fi

# Generate/retrieve credentials
ROLE_ID=$(vault read -format=json auth/approle/role/django-role/role-id | jq -r '.data.role_id')
SECRET_ID=$(vault write -f -format=json auth/approle/role/django-role/secret-id | jq -r '.data.secret_id')

# Write credentials to a file for Django
mkdir -p /vault/approle

# Restrict directory to shared group
chgrp users /vault/approle
chmod 750 /vault/approle

cat > /vault/approle/credentials.json <<EOF
{
  "role_id": "$ROLE_ID",
  "secret_id": "$SECRET_ID"
}
EOF

# Owner can read/write, shared group can read only
chgrp users /vault/approle/credentials.json
chmod 640 /vault/approle/credentials.json

echo "✅ AppRole credentials saved to /vault/approle/credentials.json"

echo "🎯 Vault initialisation and unsealing complete."

