#!/bin/sh
set -e

#export VAULT_ADDR="https://vault:8200"
export VAULT_ADDR="${VAULT_URL:-https://vault:8200}"
export VAULT_CACERT="/vault/certs/ca-cert.pem"

# Load decrypted secrets into shell variables only; do not export them
if [ -f /vault/decrypted-secrets.env ]; then
    . /vault/decrypted-secrets.env
else
    echo "⚠️  Decrypted secrets file not found." >&2
fi

if ! command -v jq > /dev/null 2>&1; then
    echo "❌ jq is required but not installed."
    exit 1
fi

if	[ ! -f /vault/certs/ca-cert.pem ]; then
	echo "🔐 Certificates missing. Generating using your script..."
	sh /app/gen_vault_cert.sh
fi

if	[ ! -f /vault/certs/nginx-cert.pem ]; then
	echo "🔐 nginx certificate missing. Generating..."
	sh /app/gen_nginx_cert.sh
fi

# Write credentials to a file for Django
# Not needed because run_dep_secure.sh already creates it
# mkdir -p /vault/approle

# Ensure secrets directory exists
mkdir -p /vault/secrets

VAULT_BOOTSTRAP_FILE="/vault/secrets/vault-bootstrap.enc"

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

    # Encrypt bootstrap JSON immediately, never write plaintext tokens
    echo "$JSON_OUTPUT" | \
        PASSPHRASE="$VAULT_BOOTSTRAP_PASSPHRASE" \
        openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt \
            -out "$VAULT_BOOTSTRAP_FILE" \
            -pass env:PASSPHRASE

    chmod 600 "$VAULT_BOOTSTRAP_FILE"
    echo "✅ Vault initialised. Encrypted bootstrap saved to $VAULT_BOOTSTRAP_FILE."
else
    echo "ℹ️ Vault is already initialised."
    if [ ! -f "$VAULT_BOOTSTRAP_FILE" ]; then
        echo "❌ CRITICAL: Vault is initialized but encrypted bootstrap file is missing."
        echo "   Please wipe the Vault volume and restart."
        exit 1
    fi
fi

# Ensure we have the bootstrap JSON in memory
if [ -z "${JSON_OUTPUT+x}" ]; then
    echo "🔓 Decrypting Vault bootstrap secrets..."
    JSON_OUTPUT=$(PASSPHRASE="$VAULT_BOOTSTRAP_PASSPHRASE" \
        openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
            -in "$VAULT_BOOTSTRAP_FILE" \
            -pass env:PASSPHRASE)
fi

SEAL_STATUS=$(vault status -format=json | jq -r '.sealed')
THRESHOLD=$(echo "$JSON_OUTPUT" | jq -r '.unseal_threshold')

if [ "$SEAL_STATUS" = "true" ]; then
    echo "🔓 Unsealing Vault..."
    i=0
    while [ $i -lt "$THRESHOLD" ]; do
        KEY=$(echo "$JSON_OUTPUT" | jq -r ".unseal_keys_b64[$i]")
        vault operator unseal "$KEY"
        i=$((i+1))
    done
    echo "✅ Vault is now unsealed."
else
    echo "ℹ️ Vault is already unsealed."
fi

#echo "⏳ Waiting for Vault to become active..."
#atmpt=0
#max_atmpts=30
#while [ $atmpt -lt $max_atmpts ]; do
#    status_output=$(vault status -format=json 2>&1)
#    if [ $? -eq 0 ] && echo "$status_output" | jq -e '.ha_enabled and (.active_node_address != null and .active_node_address != "<none>")' > /dev/null 2>&1; then
#        echo "✅ Vault is active."
#        break
#    fi
#    atmpt=$((atmpt+1))
#    sleep 2
#done
#if [ $atmpt -eq $max_atmpts ]; then
#    echo "⚠️  Vault did not become active within timeout. Proceeding anyway."
#fi

echo "⏳ Waiting for Vault to become active..."
atmpt=0
max_atmpts=30
while [ $atmpt -lt $max_atmpts ]; do
    if vault status -format=json | jq -e '.ha_mode == "active"' > /dev/null 2>&1; then
        echo "✅ Vault is active."
        break
    fi
    atmpt=$((atmpt+1))
    sleep 2
done
if [ $atmpt -eq $max_atmpts ]; then
    echo "⚠️  Vault did not become active within timeout. Proceeding anyway."
fi

ROOT_TOKEN=$(echo "$JSON_OUTPUT" | jq -r '.root_token')
if [ -z "$ROOT_TOKEN" ]; then
    echo "❌ Could not find root token."
    exit 1
fi

# --- THIS WAS ALSO MISSING ---
#export VAULT_TOKEN="$ROOT_TOKEN"
vlt() {
	VAULT_TOKEN="$ROOT_TOKEN" vault "$@"
}

if ! vlt secrets list -format=json | jq -e '.["secret/"]' > /dev/null; then
    echo "📦 Enabling KV v2 secrets engine at secret/..."
    vlt secrets enable -path=secret kv-v2
else
    echo "✅ KV v2 secrets engine already enabled."
fi

# ---- Seed all required secrets from environment ----
echo "🌱 Seeding secrets into Vault..."

if [ -n "${SECRET_KEY:-}" ]; then
    vlt kv put secret/django secret_key="$SECRET_KEY"
    echo "  ✅ secret/django written."
else
    echo "  ⚠️  SECRET_KEY not set, skipping secret/django."
fi

if [ -n "${DB_SERVER_USER:-}" ] && [ -n "${DB_SERVER_PASS:-}" ]; then
    vlt kv put secret/database user="$DB_SERVER_USER" password="$DB_SERVER_PASS"
    echo "  ✅ secret/database written."
else
    echo "  ⚠️  DB credentials not set, skipping secret/database."
fi

if [ -n "${RESTIC_PASSWORD:-}" ]; then
    vlt kv put secret/backup restic_password="$RESTIC_PASSWORD"
    echo "  ✅ secret/backup written."
else
    echo "  ⚠️  RESTIC_PASSWORD not set, skipping secret/backup."
fi

if [ -n "${FT_CLIENT_ID:-}" ] && [ -n "${FT_CLIENT_SECRET:-}" ]; then
    vlt kv put secret/oauth/42 client_id="$FT_CLIENT_ID" client_secret="$FT_CLIENT_SECRET"
    echo "  ✅ secret/oauth/42 written."
else
    echo "  ⚠️  42 OAuth keys not set, skipping secret/oauth/42."
fi

if [ -n "${GOOGLE_CLIENT_ID:-}" ] && [ -n "${GOOGLE_CLIENT_SECRET:-}" ]; then
    vlt kv put secret/oauth/google client_id="$GOOGLE_CLIENT_ID" client_secret="$GOOGLE_CLIENT_SECRET"
    echo "  ✅ secret/oauth/google written."
else
    echo "  ⚠️  Google OAuth keys not set, skipping secret/oauth/google."
fi

# ---- AppRole setup for Django ----
echo "🔐 Setting up AppRole for Django..."

# Enable AppRole if not already enabled
if ! vlt auth list -format=json | jq -e '.["approle/"]' > /dev/null 2>&1; then
    echo "  Enabling AppRole auth method..."
    vlt auth enable approle
else
    echo "  AppRole already enabled."
fi

# ---- Postgres AppRole policy/role ----
if ! vlt policy read postgres-policy > /dev/null 2>&1; then
    echo "  Creating postgres-policy policy..."
    vlt policy write postgres-policy - <<EOF
path "secret/data/database" { capabilities = ["read"] }
EOF
else
    echo "  Postgres policy already exists."
fi

if ! vlt read auth/approle/role/postgres-role > /dev/null 2>&1; then
    echo "  Creating postgres-role..."
    vlt write auth/approle/role/postgres-role \
        token_policies=postgres-policy \
        token_ttl=1h \
        token_max_ttl=4h
else
    echo "  Postgres role already exists."
fi

PG_ROLE_ID=$(vlt read -format=json auth/approle/role/postgres-role/role-id | jq -r '.data.role_id')
PG_SECRET_ID=$(vlt write -f -format=json auth/approle/role/postgres-role/secret-id | jq -r '.data.secret_id')

cat > /vault/approle/postgres-credentials.json <<EOF
{
  "role_id": "$PG_ROLE_ID",
  "secret_id": "$PG_SECRET_ID"
}
EOF

chgrp users /vault/approle/postgres-credentials.json 2>/dev/null || true
chmod 640 /vault/approle/postgres-credentials.json

echo "✅ Postgres AppRole credentials saved to /vault/approle/postgres-credentials.json"

# ---- Timeout checker AppRole policy/role ----
if ! vlt policy read timeout-checker-policy > /dev/null 2>&1; then
    echo "  Creating timeout-checker-policy..."
    vlt policy write timeout-checker-policy - <<EOF
path "secret/data/database" { capabilities = ["read"] }
EOF
else
    echo "  Timeout checker policy already exists."
fi

if ! vlt read auth/approle/role/timeout-checker-role > /dev/null 2>&1; then
    echo "  Creating timeout-checker-role..."
    vlt write auth/approle/role/timeout-checker-role \
        token_policies=timeout-checker-policy \
        token_ttl=1h \
        token_max_ttl=4h
else
    echo "  Timeout checker role already exists."
fi

TC_ROLE_ID=$(vlt read -format=json auth/approle/role/timeout-checker-role/role-id | jq -r '.data.role_id')
TC_SECRET_ID=$(vlt write -f -format=json auth/approle/role/timeout-checker-role/secret-id | jq -r '.data.secret_id')

cat > /vault/approle/timeout-checker-credentials.json <<EOF
{
  "role_id": "$TC_ROLE_ID",
  "secret_id": "$TC_SECRET_ID"
}
EOF

chgrp users /vault/approle/timeout-checker-credentials.json 2>/dev/null || true
chmod 640 /vault/approle/timeout-checker-credentials.json

echo "✅ Timeout checker AppRole credentials saved to /vault/approle/timeout-checker-credentials.json"
# ------------------------------------

# ---- Backup AppRole policy/role ----
if ! vlt policy read backup-policy > /dev/null 2>&1; then
    echo "  Creating backup-policy policy..."
    vlt policy write backup-policy - <<EOF
path "secret/data/database" { capabilities = ["read"] }
path "secret/data/backup"	{ capabilities = ["read"] }
EOF
else
    echo "  Backup policy already exists."
fi

if ! vlt read auth/approle/role/backup-role > /dev/null 2>&1; then
    echo "  Creating backup-role..."
    vlt write auth/approle/role/backup-role \
        token_policies=backup-policy \
        token_ttl=1h \
        token_max_ttl=4h
else
    echo "  Backup role already exists."
fi

BACKUP_ROLE_ID=$(vlt read -format=json auth/approle/role/backup-role/role-id | jq -r '.data.role_id')
BACKUP_SECRET_ID=$(vlt write -f -format=json auth/approle/role/backup-role/secret-id | jq -r '.data.secret_id')

cat > /vault/approle/backup-credentials.json <<EOF
{
  "role_id": "$BACKUP_ROLE_ID",
  "secret_id": "$BACKUP_SECRET_ID"
}
EOF

chgrp users /vault/approle/backup-credentials.json 2>/dev/null || true
chmod 640 /vault/approle/backup-credentials.json

echo "✅ Backup AppRole credentials saved to /vault/approle/backup-credentials.json"
# ---------------------

# Create policy if missing
if ! vlt policy read django-approle > /dev/null 2>&1; then
    echo "  Creating django-approle policy..."
    vlt policy write django-approle - <<EOF
path "secret/data/django"   { capabilities = ["read"] }
path "secret/data/database" { capabilities = ["read"] }
path "secret/data/oauth/*"  { capabilities = ["read"] }
EOF
else
    echo "  Policy already exists."
fi

# Create role if missing
if ! vlt read auth/approle/role/django-role > /dev/null 2>&1; then
    echo "  Creating django-role..."
    vlt write auth/approle/role/django-role \
        token_policies=django-approle \
        token_ttl=1h \
        token_max_ttl=4h
else
    echo "  Role already exists."
fi

# Generate/retrieve credentials
ROLE_ID=$(vlt read -format=json auth/approle/role/django-role/role-id | jq -r '.data.role_id')
SECRET_ID=$(vlt write -f -format=json auth/approle/role/django-role/secret-id | jq -r '.data.secret_id')

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

