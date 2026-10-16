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

# If vault is already running and ready, skip everything
SEAL_CHECK=$(vault status -format=json | jq -r '.sealed')
INIT_CHECK=$(vault status -format=json | jq -r '.initialized')
if [ "$INIT_CHECK" = "true" ] && [ "$SEAL_CHECK" = "false" ] && [ -f /vault/approle/credentials.json ]; then
    echo "✅ Vault already initialized, unsealed, and credentials exist. Nothing to do."
    exit 0
fi

INIT_STATUS=$(vault status -format=json | jq -r '.initialized')

#if [ "$INIT_STATUS" = "false" ]; then
#    echo "🔐 Initialising Vault..."
#    JSON_OUTPUT=$(vault operator init -format=json)

if [ "$INIT_STATUS" = "false" ]; then
    echo "🔐 Initialising Vault..."
    _init_attempt=0
    while true; do
        if JSON_OUTPUT=$(vault operator init -format=json 2>/dev/null); then
            break
        fi
        _init_attempt=$((_init_attempt+1))
        if [ $_init_attempt -ge 20 ]; then
            echo "❌ vault operator init failed after 5 attempts" >&2
            exit 1
        fi
        echo "⚠️  Init attempt $_init_attempt/5 failed, retrying in 10s..." >&2
        sleep 15
done

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

# ── CHANGE 1: retry wrapper for transient TLS/network failures ──
vlt_retry() {
    _a=0
    while ! vlt "$@"; do
        _a=$((_a+1))
        if [ $_a -ge 5 ]; then
            echo "❌ Failed after 5 retries: $*" >&2
            return 1
        fi
        echo "⚠️  Retry $_a/5: $*" >&2
        sleep 3
    done
}

echo "⏳ Waiting for Vault to become active..."
atmpt=0
max_atmpts=30
while [ $atmpt -lt $max_atmpts ]; do
    if vlt secrets list > /dev/null 2>&1; then
        echo "✅ Vault is active."
        break
    fi
    atmpt=$((atmpt+1))
    sleep 2
done
if [ $atmpt -eq $max_atmpts ]; then
    echo "❌ Vault is not responding to requests." >&2
    exit 1
fi

# ── CHANGE 2: all vlt calls below use vlt_retry ──

if ! vlt_retry secrets list -format=json | jq -e '.["secret/"]' > /dev/null; then
    echo "📦 Enabling KV v2 secrets engine at secret/..."
    vlt_retry secrets enable -path=secret kv-v2
else
    echo "✅ KV v2 secrets engine already enabled."
fi

# ════════════════════════════════════════════════════════════════════
# ★ BRANCH POINT: skip seeding + policy creation if secrets exist
# ════════════════════════════════════════════════════════════════════

if vlt_retry kv get secret/django > /dev/null 2>&1; then
    echo "ℹ️  Secrets already seeded. Skipping seeding and policy setup."
    NEEDS_SEED=false
else
    echo "🌱 Fresh Vault detected. Full seeding required."
    NEEDS_SEED=true
fi

if [ "$NEEDS_SEED" = "true" ]; then

    # ---- Seed all required secrets from environment ----
    echo "🌱 Seeding secrets into Vault..."

    if [ -n "${SECRET_KEY:-}" ]; then
        vlt_retry kv put secret/django secret_key="$SECRET_KEY"
        echo "  ✅ secret/django written."
    else
        echo "  ⚠️  SECRET_KEY not set, skipping secret/django."
    fi

    if [ -n "${DB_SERVER_USER:-}" ] && [ -n "${DB_SERVER_PASS:-}" ]; then
        vlt_retry kv put secret/database user="$DB_SERVER_USER" password="$DB_SERVER_PASS"
        echo "  ✅ secret/database written."
    else
        echo "  ⚠️  DB credentials not set, skipping secret/database."
    fi

    if [ -n "${MONITOR_PASS:-}" ]; then
        vlt_retry kv put secret/monitoring pg_monitor_password="$MONITOR_PASS"
        echo "  ✅ secret/monitoring written."
    else
        echo "  ⚠️  MONITOR_PASS not set, skipping secret/monitoring."
    fi

    if [ -n "${RESTIC_PASSWORD:-}" ]; then
        vlt_retry kv put secret/backup restic_password="$RESTIC_PASSWORD"
        echo "  ✅ secret/backup written."
    else
        echo "  ⚠️  RESTIC_PASSWORD not set, skipping secret/backup."
    fi

    if [ -n "${FT_CLIENT_ID:-}" ] && [ -n "${FT_CLIENT_SECRET:-}" ]; then
        vlt_retry kv put secret/oauth/42 client_id="$FT_CLIENT_ID" client_secret="$FT_CLIENT_SECRET"
        echo "  ✅ secret/oauth/42 written."
    else
        echo "  ⚠️  42 OAuth keys not set, skipping secret/oauth/42."
    fi

    if [ -n "${GOOGLE_CLIENT_ID:-}" ] && [ -n "${GOOGLE_CLIENT_SECRET:-}" ]; then
        vlt_retry kv put secret/oauth/google client_id="$GOOGLE_CLIENT_ID" client_secret="$GOOGLE_CLIENT_SECRET"
        echo "  ✅ secret/oauth/google written."
    else
        echo "  ⚠️  Google OAuth keys not set, skipping secret/oauth/google."
    fi

    # ---- AppRole setup ----
    echo "🔐 Setting up AppRole auth and policies..."

    # Enable AppRole if not already enabled
    if ! vlt_retry auth list -format=json | jq -e '.["approle/"]' > /dev/null 2>&1; then
        echo "  Enabling AppRole auth method..."
        vlt_retry auth enable approle
    else
        echo "  AppRole already enabled."
    fi

    # ---- Postgres policy/role ----
    if ! vlt_retry policy read postgres-policy > /dev/null 2>&1; then
        echo "  Creating postgres-policy policy..."
        vlt_retry policy write postgres-policy - <<EOF
path "secret/data/database"		{ capabilities = ["read"] }
path "secret/data/monitoring"	{ capabilities = ["read"] }
EOF
    else
        echo "  Postgres policy already exists."
    fi

    if ! vlt_retry read auth/approle/role/postgres-role > /dev/null 2>&1; then
        echo "  Creating postgres-role..."
        vlt_retry write auth/approle/role/postgres-role \
            token_policies=postgres-policy \
            token_ttl=1h \
            token_max_ttl=4h
    else
        echo "  Postgres role already exists."
    fi

    # ---- Timeout checker policy/role ----
    if ! vlt_retry policy read timeout-checker-policy > /dev/null 2>&1; then
        echo "  Creating timeout-checker-policy..."
        vlt_retry policy write timeout-checker-policy - <<EOF
path "secret/data/database" { capabilities = ["read"] }
EOF
    else
        echo "  Timeout checker policy already exists."
    fi

    if ! vlt_retry read auth/approle/role/timeout-checker-role > /dev/null 2>&1; then
        echo "  Creating timeout-checker-role..."
        vlt_retry write auth/approle/role/timeout-checker-role \
            token_policies=timeout-checker-policy \
            token_ttl=1h \
            token_max_ttl=4h
    else
        echo "  Timeout checker role already exists."
    fi

    # ---- Backup policy/role ----
    if ! vlt_retry policy read backup-policy > /dev/null 2>&1; then
        echo "  Creating backup-policy policy..."
        vlt_retry policy write backup-policy - <<EOF
path "secret/data/database" { capabilities = ["read"] }
path "secret/data/backup"	{ capabilities = ["read"] }
EOF
    else
        echo "  Backup policy already exists."
    fi

    if ! vlt_retry read auth/approle/role/backup-role > /dev/null 2>&1; then
        echo "  Creating backup-role..."
        vlt_retry write auth/approle/role/backup-role \
            token_policies=backup-policy \
            token_ttl=1h \
            token_max_ttl=4h
    else
        echo "  Backup role already exists."
    fi

    # ---- Django policy/role ----
    if ! vlt_retry policy read django-approle > /dev/null 2>&1; then
        echo "  Creating django-approle policy..."
        vlt_retry policy write django-approle - <<EOF
path "secret/data/django"   { capabilities = ["read"] }
path "secret/data/database" { capabilities = ["read"] }
path "secret/data/oauth/*"  { capabilities = ["read"] }
EOF
    else
        echo "  Policy already exists."
    fi

    if ! vlt_retry read auth/approle/role/django-role > /dev/null 2>&1; then
        echo "  Creating django-role..."
        vlt_retry write auth/approle/role/django-role \
            token_policies=django-approle \
            token_ttl=1h \
            token_max_ttl=4h
    else
        echo "  Role already exists."
    fi

fi  # end NEEDS_SEED

# ════════════════════════════════════════════════════════════════════
# AppRole credential regeneration — always runs to avoid TTL issues
# ════════════════════════════════════════════════════════════════════

echo "🔐 Generating fresh AppRole credentials..."

# Restrict directory to shared group
chgrp users /vault/approle 2>/dev/null || true
chmod 750 /vault/approle

# ---- Django credentials ----
ROLE_ID=$(vlt_retry read -format=json auth/approle/role/django-role/role-id | jq -r '.data.role_id')
SECRET_ID=$(vlt_retry write -f -format=json auth/approle/role/django-role/secret-id | jq -r '.data.secret_id')

cat > /vault/approle/credentials.json <<EOF
{
  "role_id": "$ROLE_ID",
  "secret_id": "$SECRET_ID"
}
EOF

chgrp users /vault/approle/credentials.json 2>/dev/null || true
chmod 640 /vault/approle/credentials.json
echo "  ✅ Django AppRole credentials written."

# ---- Postgres credentials ----
PG_ROLE_ID=$(vlt_retry read -format=json auth/approle/role/postgres-role/role-id | jq -r '.data.role_id')
PG_SECRET_ID=$(vlt_retry write -f -format=json auth/approle/role/postgres-role/secret-id | jq -r '.data.secret_id')

cat > /vault/approle/postgres-credentials.json <<EOF
{
  "role_id": "$PG_ROLE_ID",
  "secret_id": "$PG_SECRET_ID"
}
EOF

chgrp users /vault/approle/postgres-credentials.json 2>/dev/null || true
chmod 640 /vault/approle/postgres-credentials.json
echo "  ✅ Postgres AppRole credentials written."

# ---- Timeout checker credentials ----
TC_ROLE_ID=$(vlt_retry read -format=json auth/approle/role/timeout-checker-role/role-id | jq -r '.data.role_id')
TC_SECRET_ID=$(vlt_retry write -f -format=json auth/approle/role/timeout-checker-role/secret-id | jq -r '.data.secret_id')

cat > /vault/approle/timeout-checker-credentials.json <<EOF
{
  "role_id": "$TC_ROLE_ID",
  "secret_id": "$TC_SECRET_ID"
}
EOF

chgrp users /vault/approle/timeout-checker-credentials.json 2>/dev/null || true
chmod 640 /vault/approle/timeout-checker-credentials.json
echo "  ✅ Timeout checker AppRole credentials written."

# ---- Backup credentials ----
BACKUP_ROLE_ID=$(vlt_retry read -format=json auth/approle/role/backup-role/role-id | jq -r '.data.role_id')
BACKUP_SECRET_ID=$(vlt_retry write -f -format=json auth/approle/role/backup-role/secret-id | jq -r '.data.secret_id')

cat > /vault/approle/backup-credentials.json <<EOF
{
  "role_id": "$BACKUP_ROLE_ID",
  "secret_id": "$BACKUP_SECRET_ID"
}
EOF

chgrp users /vault/approle/backup-credentials.json 2>/dev/null || true
chmod 640 /vault/approle/backup-credentials.json
echo "  ✅ Backup AppRole credentials written."

echo "🎯 Vault initialisation and unsealing complete."

