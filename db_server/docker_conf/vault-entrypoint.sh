#!/usr/bin/env bash
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-https://vault:8200}"
VAULT_CACERT="${VAULT_CACERT:-/vault/certs/ca-cert.pem}"
CRED_FILE="/vault/approle/postgres-credentials.json"

if	[ ! -f "$CRED_FILE" ]; then
	echo "❌ Postgres AppRole credentials file not found." >&2
	exit 1
fi

ROLE_ID=$(jq -r '.role_id' "$CRED_FILE")
SECRET_ID=$(jq -r '.secret_id' "$CRED_FILE")

if	[ -z "$ROLE_ID" ] || [ -z "$SECRET_ID" ]; then
	echo "❌ Postgres AppRole credentials missing." >&2
    exit 1
fi

echo "🔐 Postgres authenticating to Vault..."
VAULT_TOKEN=$(curl -sS --cacert "$VAULT_CACERT" \
	--request		POST \
	--data			"{\"role_id\":\"$ROLE_ID\",\"secret_id\":\"$SECRET_ID\"}" \
	"$VAULT_ADDR/v1/auth/approle/login" | jq -r '.auth.client_token' \
)

if	[ -z "$VAULT_TOKEN" ] || [ "$VAULT_TOKEN" = "null" ]; then
	echo "❌ Postgres Vault login failed." >&2
    exit 1
fi

echo "📦 Postgres fetching database credentials from Vault..."
DB_SECRET=$(curl -sS --cacert "$VAULT_CACERT" \
	--header	"X-Vault-Token: $VAULT_TOKEN" \
	"$VAULT_ADDR/v1/secret/data/database" | jq -r '.data.data' \
)

POSTGRES_USER_FILE="/dev/shm/vault-postgres-user"
POSTGRES_PASSWORD_FILE="/dev/shm/vault-postgres-password"

umask 077
printf '%s' "$(echo "$DB_SECRET" | jq -r '.user')" > "$POSTGRES_USER_FILE"
printf '%s' "$(echo "$DB_SECRET" | jq -r '.password')" > "$POSTGRES_PASSWORD_FILE"

chown postgres:postgres "$POSTGRES_USER_FILE" "$POSTGRES_PASSWORD_FILE"

unset VAULT_TOKEN ROLE_ID SECRET_ID DB_SECRET

mkdir -p /var/lib/postgresql/18/data
chown -R postgres:postgres /var/lib/postgresql

POSTGRES_USER_FILE="$POSTGRES_USER_FILE" \
POSTGRES_PASSWORD_FILE="$POSTGRES_PASSWORD_FILE" \
exec docker-entrypoint.sh "$@"

