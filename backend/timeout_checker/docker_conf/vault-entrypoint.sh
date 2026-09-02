#!/usr/bin/env bash
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-https://vault:8200}"
VAULT_CACERT="${VAULT_CACERT:-/vault/certs/ca-cert.pem}"
CRED_FILE="/vault/approle/timeout-checker-credentials.json"

if	[ ! -f "$CRED_FILE" ]; then
	echo "❌ Timeout checker AppRole credentials file not found." >&2
    exit 1
fi

ROLE_ID=$(jq -r '.role_id' "$CRED_FILE")
SECRET_ID=$(jq -r '.secret_id' "$CRED_FILE")

if	[ -z "$ROLE_ID" ] || [ -z "$SECRET_ID" ]; then
	echo "❌ Timeout checker AppRole credentials missing." >&2
    exit 1
fi

echo "🔐 Timeout checker authenticating to Vault..."
VAULT_TOKEN=$(curl -sS --cacert "$VAULT_CACERT" \
	--request		POST \
	--data			"{\"role_id\":\"$ROLE_ID\",\"secret_id\":\"$SECRET_ID\"}" \
	"$VAULT_ADDR/v1/auth/approle/login" | jq -r '.auth.client_token' \
)

if	[ -z "$VAULT_TOKEN" ] || [ "$VAULT_TOKEN" = "null" ]; then
	echo "❌ Timeout checker Vault login failed." >&2
    exit 1
fi

echo "📦 Timeout checker fetching database credentials from Vault..."
DB_SECRET=$(curl -sS --cacert "$VAULT_CACERT" \
	--header		"X-Vault-Token: $VAULT_TOKEN" \
	"$VAULT_ADDR/v1/secret/data/database" | jq -r '.data.data' \
)

if	[ -z "$DB_SECRET" ] || [ "$DB_SECRET" = "null" ]; then
	echo "❌ Timeout checker failed to read secret/database." >&2
    exit 1
fi

DB_USER_FILE="/dev/shm/vault-db-user"
DB_PASS_FILE="/dev/shm/vault-db-pass"

umask 077
printf '%s' "$(echo "$DB_SECRET" | jq -r '.user')" > "$DB_USER_FILE"
printf '%s' "$(echo "$DB_SECRET" | jq -r '.password')" > "$DB_PASS_FILE"

unset VAULT_TOKEN ROLE_ID SECRET_ID DB_SECRET

DB_USER_FILE="$DB_USER_FILE" \
DB_PASS_FILE="$DB_PASS_FILE" \
exec python manage.py check_timeouts "$@"




