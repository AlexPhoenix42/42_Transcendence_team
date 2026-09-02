#!/usr/bin/env bash

docker exec trans_backup sh -c '
ROLE_ID=$(jq -r .role_id /vault/approle/backup-credentials.json)
SECRET_ID=$(jq -r .secret_id /vault/approle/backup-credentials.json)
VAULT_TOKEN=$(curl -sS --cacert "$VAULT_CACERT" \
  --request POST \
  --data "{\"role_id\":\"$ROLE_ID\",\"secret_id\":\"$SECRET_ID\"}" \
  "$VAULT_ADDR/v1/auth/approle/login" | jq -r .auth.client_token)
RESTIC_PASSWORD=$(curl -sS --cacert "$VAULT_CACERT" \
  --header "X-Vault-Token: $VAULT_TOKEN" \
  "$VAULT_ADDR/v1/secret/data/backup" | jq -r .data.data.restic_password)
export RESTIC_PASSWORD RESTIC_REPOSITORY=/backup-repo
restic snapshots
'

