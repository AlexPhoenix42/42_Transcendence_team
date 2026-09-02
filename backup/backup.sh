#!/bin/sh
set -e

# Paths and env
APPROLE_FILE="/vault/approle/backup-credentials.json"
VAULT_ADDR="${VAULT_ADDR:-https://vault:8200}"
VAULT_CACERT="${VAULT_CACERT:-/vault/certs/ca-cert.pem}"
DB_HOST="trans_db_server"
DB_PORT="5432"
DB_NAME="${DB_NAME:-postgres}"
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/backup-repo}"
DUMP_FILE="/tmp/db_dump.sql"
#export XDG_CACHE_HOME=/tmp/restic-cache	# this been moved to the Dockerfile

# Check required files
if [ ! -f "$APPROLE_FILE" ]; then
    echo "❌ AppRole credentials file missing: $APPROLE_FILE" >&2
    exit 1
fi

# Read role_id and secret_id
ROLE_ID=$(jq -r '.role_id' "$APPROLE_FILE")
SECRET_ID=$(jq -r '.secret_id' "$APPROLE_FILE")

if [ -z "$ROLE_ID" ] || [ -z "$SECRET_ID" ]; then
    echo "❌ Invalid AppRole credentials in $APPROLE_FILE" >&2
    exit 1
fi

# Authenticate to Vault
echo "🔐 Authenticating to Vault..."
LOGIN_RESPONSE=$(curl -sS --cacert "$VAULT_CACERT" \
    --request POST \
    --data "{\"role_id\":\"$ROLE_ID\",\"secret_id\":\"$SECRET_ID\"}" \
    "$VAULT_ADDR/v1/auth/approle/login")

VAULT_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.auth.client_token')
if [ -z "$VAULT_TOKEN" ] || [ "$VAULT_TOKEN" = "null" ]; then
    echo "❌ Vault login failed: $LOGIN_RESPONSE" >&2
    exit 1
fi

# Fetch database credentials
echo "🔍 Fetching database credentials..."
DB_SECRET=$(curl -sS --cacert "$VAULT_CACERT" \
    --header "X-Vault-Token: $VAULT_TOKEN" \
    "$VAULT_ADDR/v1/secret/data/database")

DB_USER=$(echo "$DB_SECRET" | jq -r '.data.data.user')
DB_PASS=$(echo "$DB_SECRET" | jq -r '.data.data.password')

if [ -z "$DB_USER" ] || [ "$DB_USER" = "null" ] || [ -z "$DB_PASS" ] || [ "$DB_PASS" = "null" ]; then
    echo "❌ Failed to fetch DB credentials from Vault" >&2
    exit 1
fi

# Fetch RESTIC password
echo "🔍 Fetching restic password..."
BACKUP_SECRET=$(curl -sS --cacert "$VAULT_CACERT" \
    --header "X-Vault-Token: $VAULT_TOKEN" \
    "$VAULT_ADDR/v1/secret/data/backup")

RESTIC_PASSWORD=$(echo "$BACKUP_SECRET" | jq -r '.data.data.restic_password')
if [ -z "$RESTIC_PASSWORD" ] || [ "$RESTIC_PASSWORD" = "null" ]; then
    echo "❌ Failed to fetch restic password from Vault" >&2
    exit 1
fi

# Export for restic
export RESTIC_PASSWORD
export RESTIC_REPOSITORY

# Initialize restic repo if not already
if ! restic snapshots > /dev/null 2>&1; then
    echo "📦 Initializing restic repository..."
    restic init
fi

# Create database dump
echo "💾 Dumping database..."
PGPASSWORD="$DB_PASS" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$DUMP_FILE"

# Perform backup
echo "📤 Backing up with restic..."
restic backup "$DUMP_FILE" /media /app/.env.secrets.enc

# Prune old snapshots (keep last 7 daily)
echo "🧹 Pruning old snapshots..."
restic forget --keep-daily 7 --prune

# Clean up
rm -f "$DUMP_FILE"

echo "✅ Backup completed successfully."

