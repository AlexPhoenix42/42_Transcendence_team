#!/usr/bin/env bash
# Provisions the ELK stack's secrets in Vault, following the same shape as
# scripts_dev/setup-vault-approle.sh: enable AppRole, write a policy, create a
# role, and emit a credentials file under vault/approle/.
#
# Idempotent -- safe to re-run. Re-running rotates the secret_id (Vault issues a
# new one each time), so re-run ELK/vault/sync-elk-env.sh afterwards.
#
# Usage:
#   ./ELK/vault/setup-elk-vault.sh [compose-file]      # default: docker-compose-dev.yml
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

COMPOSE_FILE="${1:-docker-compose-dev.yml}"
KEYS_FILE="vault/secrets/tokens.json"
ELK_ENV="ELK/.env.elk"
APPROLE_DIR="vault/approle"
APPROLE_FILE="${APPROLE_DIR}/elasticsearch-credentials.json"

command -v jq >/dev/null || { echo "jq is required." >&2; exit 1; }

# dep keeps its root token in vault/secrets/tokens.json; dev runs Vault in dev
# mode with a fixed root token. Same split the other scripts in this repo use.
if [ -f "${KEYS_FILE}" ]; then
	ROOT_TOKEN="$(jq -r '.root_token' "${KEYS_FILE}")"
	VAULT_ENV=(-e "VAULT_CACERT=/vault/certs/ca-cert.pem")
	echo "==> Using the root token from ${KEYS_FILE}"
else
	ROOT_TOKEN="root"
	VAULT_ENV=(-e "VAULT_ADDR=http://127.0.0.1:8200")
	echo "==> No ${KEYS_FILE}; assuming dev-mode Vault with the root token"
fi

vault_cmd() {
	docker compose -f "${COMPOSE_FILE}" exec -T \
		"${VAULT_ENV[@]}" -e "VAULT_TOKEN=${ROOT_TOKEN}" \
		vault vault "$@"
}

echo "==> Enabling the AppRole auth method"
vault_cmd auth enable approle 2>/dev/null || echo "    already enabled"

echo "==> Writing policy elk-policy"
vault_cmd policy write elk-policy - < ELK/vault/elk-policy.hcl

echo "==> Creating AppRole elk-role"
vault_cmd write auth/approle/role/elk-role \
	token_ttl=1h \
	token_max_ttl=4h \
	policies="elk-policy" >/dev/null

# Seed Vault from the currently generated credentials so the running stack keeps
# working. prepare-elk-dirs.sh created them; from here Vault is the source of
# truth and ELK/.env.elk is a derived cache (see sync-elk-env.sh).
[ -f "${ELK_ENV}" ] || { echo "${ELK_ENV} missing -- run ELK/host-setup/prepare-elk-dirs.sh first." >&2; exit 1; }
# shellcheck disable=SC1090
set -a; . "./${ELK_ENV}"; set +a

echo "==> Storing credentials at secret/elasticsearch"
vault_cmd kv put secret/elasticsearch \
	elastic_password="${ELASTIC_PASSWORD}" \
	kibana_system_password="${KIBANA_SYSTEM_PASSWORD}" \
	logstash_password="${LOGSTASH_PASSWORD}" \
	kibana_encryption_key="${XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY}" \
	kibana_reporting_key="${XPACK_REPORTING_ENCRYPTIONKEY}" \
	kibana_security_key="${XPACK_SECURITY_ENCRYPTIONKEY}" >/dev/null

echo "==> Issuing AppRole credentials"
ROLE_ID="$(vault_cmd read -field=role_id auth/approle/role/elk-role/role-id | tr -d '\r')"
SECRET_ID="$(vault_cmd write -f -field=secret_id auth/approle/role/elk-role/secret-id | tr -d '\r')"

# vault/approle is owned by uid 100 (the vault user) with mode 750, so it is not
# writable by the invoking user. Write through a throwaway root container and
# set the same ownership up_dep_secure.sh uses, rather than requiring sudo.
docker run --rm -i \
	-v "${REPO_ROOT}/${APPROLE_DIR}:/out" \
	-e ROLE_ID="${ROLE_ID}" -e SECRET_ID="${SECRET_ID}" \
	alpine:latest sh -c '
		printf "{\n  \"role_id\": \"%s\",\n  \"secret_id\": \"%s\"\n}\n" \
			"$ROLE_ID" "$SECRET_ID" > /out/elasticsearch-credentials.json
		chown 100:100 /out/elasticsearch-credentials.json
		chmod 640      /out/elasticsearch-credentials.json
	'

echo
echo "OK: ${APPROLE_FILE} written."
echo "    Next: ./ELK/vault/sync-elk-env.sh   (regenerates ${ELK_ENV} from Vault)"
