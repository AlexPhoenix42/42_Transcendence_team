#!/bin/sh
# demo-backup.sh — Demonstrate backup + restore capability
set -e

echo "═══════════════════════════════════════════"
echo "  📦 Backup System Demo"
echo "═══════════════════════════════════════════"
echo

# Step 1: Trigger a manual backup
echo "1️⃣  Triggering manual backup..."
docker exec trans_backup /app/backup.sh
echo

# Step 2: List snapshots
echo "2️⃣  Listing restic snapshots..."
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
echo

# Step 3: Show contents of latest snapshot
echo "3️⃣  Files in latest snapshot..."
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
restic ls latest
'
echo

echo "═══════════════════════════════════════════"
echo "  ✅ Backup system is fully operational"
echo "═══════════════════════════════════════════"

