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

mkdir -p /var/lib/postgresql/18/data
chown -R postgres:postgres /var/lib/postgresql

# ── Ensure the read-only prometheus_monitor user exists ───────────────────
# Runs in the background: waits for Postgres to accept local connections, then
# creates/updates the monitoring user. Uses the local socket as the postgres
# superuser (peer auth), so no password or network is needed. Idempotent.
ensure_monitor_user() {
	local pw=$(curl -sS --cacert "$VAULT_CACERT" \
		--header "X-Vault-Token: $MONITOR_VAULT_TOKEN" \
		"$VAULT_ADDR/v1/secret/data/monitoring" | jq -r '.data.data.pg_monitor_password')

	if [ -z "$pw" ] || [ "$pw" = "null" ]; then
		echo "⚠️  monitor password not in Vault; skipping." >&2
		return 0
	fi

	# Retry: survives Postgres's two-phase init startup. The real server
	# (not the temporary init one) accepts our SQL only once it's truly up.
	i=0
	while [ "$i" -lt 30 ]; do
		if PGPASSWORD="$(cat /dev/shm/vault-postgres-password)" \
			psql -v ON_ERROR_STOP=1 -h /var/run/postgresql \
			-U "$(cat /dev/shm/vault-postgres-user)" \
			-d "${POSTGRES_DB:-postgres}" <<SQL 2>/dev/null
DO \$\$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'prometheus_monitor') THEN
		CREATE USER prometheus_monitor;
	END IF;
END
\$\$;
ALTER USER prometheus_monitor WITH PASSWORD '$pw';
GRANT pg_monitor TO prometheus_monitor;
SQL
		then
			echo "✅ prometheus_monitor ensured." >&2
			return 0
		fi
		i=$((i + 1))
		sleep 2
	done
	echo "⚠️  could not ensure prometheus_monitor after retries." >&2
}
# ──────────────────────────────────────────────────────────────────────────

unset VAULT_TOKEN ROLE_ID SECRET_ID DB_SECRET

POSTGRES_USER_FILE="$POSTGRES_USER_FILE" \
POSTGRES_PASSWORD_FILE="$POSTGRES_PASSWORD_FILE" \
exec docker-entrypoint.sh "$@"

