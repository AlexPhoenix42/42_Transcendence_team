#!/usr/bin/env bash
set -e

COMPOSE_FILE="../docker-compose.yml"
JSON_KEYS_FILE="../vault/secrets/tokens.json"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required. Install it and try again."
    exit 1
fi

# Read the root token
if [ ! -f "$JSON_KEYS_FILE" ]; then
    echo "❌ Keys file not found. Run init_unseal_vault.sh first."
    exit 1
fi
ROOT_TOKEN=$(jq -r '.root_token' "$JSON_KEYS_FILE")
if [ -z "$ROOT_TOKEN" ]; then
    echo "❌ Could not read root token from $JSON_KEYS_FILE."
    exit 1
fi

# 1. Enable AppRole (idempotent)
docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem -e VAULT_TOKEN="$ROOT_TOKEN" vault vault auth enable approle 2>/dev/null || \
    echo "✅ AppRole already enabled."

# 2. Write policy
docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem -e VAULT_TOKEN="$ROOT_TOKEN" vault vault policy write Trans-policy - << 'EOF'
path "secret/data/django"	{ capabilities = ["read"] }
path "secret/data/database"	{ capabilities = ["read"] }
path "secret/data/oauth/*"	{ capabilities = ["read"] }
EOF

echo "✅ Policy 'Trans-policy' written."

# 3. Create/update AppRole
docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem -e VAULT_TOKEN="$ROOT_TOKEN" vault vault write auth/approle/role/trans-role \
    token_ttl=1h \
    token_max_ttl=4h \
    policies="Trans-policy" \
    2>/dev/null || echo "✅ AppRole already configured."

# 4. Retrieve credentials
ROLE_ID=$(docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem -e VAULT_TOKEN="$ROOT_TOKEN" vault vault read \
    -field=role_id auth/approle/role/trans-role/role-id)

SECRET_ID=$(docker compose -f "$COMPOSE_FILE" exec -T -e VAULT_CACERT=/vault/certs/ca-cert.pem -e VAULT_TOKEN="$ROOT_TOKEN" vault vault write \
    -f -field=secret_id auth/approle/role/trans-role/secret-id)

echo ""
echo "=========================================="
echo "✅ AppRole Credentials"
echo "=========================================="
echo "VAULT_ROLE_ID=$ROLE_ID"
echo "VAULT_SECRET_ID=$SECRET_ID"
echo "=========================================="
echo ""
echo "Add these to your .env file and restart your stack."














##!/usr/bin/env bash
#set -e
#
#COMPOSE_FILE="../docker-compose.yml"
#
## 1. Enable AppRole (idempotent)
#docker compose -f "$COMPOSE_FILE" exec -T vault vault auth enable approle 2>/dev/null || \
#	echo "✅ AppRole already enabled."
#
## 2. Write policy
#docker compose -f "$COMPOSE_FILE" exec -T vault vault policy write Trans-policy - << 'EOF'
#path "secret/data/django"	{ capabilities = ["read"] }
#path "secret/data/database"	{ capabilities = ["read"] }
#path "secret/data/oauth/*"	{ capabilities = ["read"] }
#EOF
#
#echo "✅ Policy 'Trans-policy' written."
#
## 3. Create/update AppRole
#docker compose -f "$COMPOSE_FILE" exec -T vault vault write auth/approle/role/trans-role \
#	token_ttl=1h \
#	token_max_ttl=4h \
#	policies="Trans-policy" \
#	2>/dev/null || echo "✅ AppRole already configured."
#
## 4. Retrieve credentials
#ROLE_ID=$(docker compose -f "$COMPOSE_FILE" exec -T vault vault read \
#	-field=role_id auth/approle/role/trans-role/role-id)
#
#SECRET_ID=$(docker compose -f "$COMPOSE_FILE" exec -T vault vault write \
#	-f -field=secret_id auth/approle/role/trans-role/secret-id)
#
#echo ""
#echo "=========================================="
#echo "✅ AppRole Credentials"
#echo "=========================================="
#echo "VAULT_ROLE_ID=$ROLE_ID"
#echo "VAULT_SECRET_ID=$SECRET_ID"
#echo "=========================================="
#echo ""
#echo "Add these to your .env file and restart your stack."



##!/usr/bin/env bash
#set -e
#
## 1. Enable AppROLE (idempotent)
#docker compose exec -T vault vault auth enable approle 2>/dev/null || \
#	echo "AppRole already enabled."
#
## 2. Write policy
## Trans-policy: read access to all secrets used by Transcendence services
#docker compose exec -T vault vault policy write Trans-policy - << 'EOF'
#path "secret/data/django"	{ capabilities = ["read"] }
#
#path "secret/data/database"	{ capabilities = ["read"] }
#
#path "secret/data/oauth/*"	{ capabilities = ["read"] }
#EOF
#
#echo "Policy 'Trans-policy' written."
#
## 3. Create/udpate AppRole
#docker compose exec -T vault vault write auth/approle/role/trans-role \
#	token_ttl=1h \
#	token_max_ttl=4h \
#	policies="Trans-policy" \
#	2>/dev/null || echo "AppRole already configured."
#
## 4. Retrieve credentials
#ROLE_ID=$(docker compose exec -T vault vault read \
#	-field=role_id auth/approle/role/trans-role/role-id)
#
#SECRET_ID=$(docker compose exec -T vault vault write \
#	-f -field=secret_id auth/approle/role/trans-role/secret-id)
#
#echo ""
#echo "=========================================="
#echo "✅ AppRole Credentials"
#echo "=========================================="
#echo "VAULT_ROLE_ID=$ROLE_ID"
#echo "VAULT_SECRET_ID=$SECRET_ID"
#echo "=========================================="
#echo ""
#echo "Add these to your .env file and restart your stack."

