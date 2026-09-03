#!/usr/bin/env bash
# Regenerates ELK/.env.elk from Vault, using the AppRole credentials written by
# setup-elk-vault.sh.
#
# This is the point of the exercise: Vault is the source of truth for the ELK
# credentials, and ELK/.env.elk is a derived, git-ignored cache that
# docker-compose consumes via `env_file:`. It mirrors how up_dep_secure.sh
# already feeds decrypted secrets to compose rather than committing them.
#
# Uses the same curl+jq AppRole flow as backup/backup.sh.
#
# Usage: ./ELK/vault/sync-elk-env.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

APPROLE_FILE="vault/approle/elasticsearch-credentials.json"
ELK_ENV="ELK/.env.elk"
# Dev publishes Vault on the host as plain HTTP; dep is TLS behind the CA cert.
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
VAULT_CACERT="${VAULT_CACERT:-vault/certs/ca-cert.pem}"

command -v jq >/dev/null || { echo "jq is required." >&2; exit 1; }
[ -r "${APPROLE_FILE}" ] || {
	echo "Cannot read ${APPROLE_FILE}. Run ELK/vault/setup-elk-vault.sh first" >&2
	echo "(the file is mode 640 owned by uid 100; you may need to be in its group)." >&2
	exit 1
}

CURL_OPTS=(-sS)
case "${VAULT_ADDR}" in
	https://*) CURL_OPTS+=(--cacert "${VAULT_CACERT}") ;;
esac

ROLE_ID="$(jq -r '.role_id'   "${APPROLE_FILE}")"
SECRET_ID="$(jq -r '.secret_id' "${APPROLE_FILE}")"
[ -n "${ROLE_ID}" ] && [ "${ROLE_ID}" != "null" ] || { echo "Invalid role_id" >&2; exit 1; }

echo "==> Authenticating to Vault with the elk-role AppRole"
LOGIN="$(curl "${CURL_OPTS[@]}" -X POST \
	--data "{\"role_id\":\"${ROLE_ID}\",\"secret_id\":\"${SECRET_ID}\"}" \
	"${VAULT_ADDR}/v1/auth/approle/login")"

TOKEN="$(printf '%s' "${LOGIN}" | jq -r '.auth.client_token')"
[ -n "${TOKEN}" ] && [ "${TOKEN}" != "null" ] || { echo "Vault login failed: ${LOGIN}" >&2; exit 1; }

echo "==> Fetching secret/data/elasticsearch"
SECRET="$(curl "${CURL_OPTS[@]}" -H "X-Vault-Token: ${TOKEN}" \
	"${VAULT_ADDR}/v1/secret/data/elasticsearch")"

get() {
	_v="$(printf '%s' "${SECRET}" | jq -r ".data.data.$1")"
	[ -n "${_v}" ] && [ "${_v}" != "null" ] || { echo "Missing field '$1' in Vault secret" >&2; exit 1; }
	printf '%s' "${_v}"
}

ELASTIC_PW="$(get elastic_password)"
KIBANA_PW="$(get kibana_system_password)"
LOGSTASH_PW="$(get logstash_password)"
ENC_KEY="$(get kibana_encryption_key)"
REP_KEY="$(get kibana_reporting_key)"
SEC_KEY="$(get kibana_security_key)"

echo "==> Writing ${ELK_ENV}"
umask 077
cat > "${ELK_ENV}" <<EOF
# GENERATED FROM VAULT by ELK/vault/sync-elk-env.sh -- do not edit, do not commit.
# Source of truth: secret/data/elasticsearch (read via the elk-role AppRole).
# Variables are named after what each consumer expects, so services can load
# this file directly via \`env_file:\` with no name mapping.

ELASTIC_PASSWORD=${ELASTIC_PW}

KIBANA_SYSTEM_PASSWORD=${KIBANA_PW}
ELASTICSEARCH_USERNAME=kibana_system
ELASTICSEARCH_PASSWORD=${KIBANA_PW}

XPACK_ENCRYPTEDSAVEDOBJECTS_ENCRYPTIONKEY=${ENC_KEY}
XPACK_REPORTING_ENCRYPTIONKEY=${REP_KEY}
XPACK_SECURITY_ENCRYPTIONKEY=${SEC_KEY}

LOGSTASH_PASSWORD=${LOGSTASH_PW}
EOF
chmod 600 "${ELK_ENV}"

echo
echo "OK: ${ELK_ENV} regenerated from Vault."
