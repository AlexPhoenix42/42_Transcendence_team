#!/usr/bin/env bash
# ensure_monitor_user.sh
# Creates/updates the prometheus_monitor Postgres role using credentials from Vault.
# Called by run_dep_secure.sh after Postgres is healthy.
set -euo pipefail

CONTAINER="${1:-trans_db_server}"

docker exec "$CONTAINER" bash -c '
	CRED="/vault/approle/postgres-credentials.json"
	TOKEN=$(curl -sS --cacert /vault/certs/ca-cert.pem \
		--request POST \
		--data "{\"role_id\":\"$(jq -r .role_id $CRED)\",\"secret_id\":\"$(jq -r .secret_id $CRED)\"}" \
		https://vault:8200/v1/auth/approle/login | jq -r .auth.client_token)

	pw=$(curl -sS --cacert /vault/certs/ca-cert.pem \
		--header "X-Vault-Token: $TOKEN" \
		https://vault:8200/v1/secret/data/monitoring | jq -r .data.data.pg_monitor_password)

	if [ -z "$pw" ] || [ "$pw" = "null" ]; then
		echo "⚠️  No monitor password in Vault; skipping."
		exit 0
	fi

	PGPASSWORD="$(cat /dev/shm/vault-postgres-password)" \
		psql -h /var/run/postgresql \
		-U "$(cat /dev/shm/vault-postgres-user)" \
		-d trans_server_db <<-SQL
		DO \$\$
		BEGIN
			IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '"'"'prometheus_monitor'"'"') THEN
				CREATE USER prometheus_monitor;
			END IF;
		END
		\$\$;
		ALTER USER prometheus_monitor WITH PASSWORD '"'"'$pw'"'"';
		GRANT pg_monitor TO prometheus_monitor;
	SQL
'
echo "✅ prometheus_monitor ensured."

