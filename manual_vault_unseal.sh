#!/usr/bin/env bash
set -euo pipefail

PLAIN_ENV=".env"
ENCRYPTED_SEC_ENV=".env.secrets.enc"
DECRYPTED_SEC_ENV="/dev/shm/trans.env"

# 1. Prompt for passphrase once
read -s -p "Vault bootstrap passphrase: " PASSPHRASE
echo

# 2. Decrypt secrets to /dev/shm
PASSPHRASE="$PASSPHRASE" \
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
    -in  "$ENCRYPTED_SEC_ENV" \
    -out "$DECRYPTED_SEC_ENV" \
    -pass "env:PASSPHRASE"

unset PASSPHRASE

chmod 600 "$DECRYPTED_SEC_ENV"
chown 100:100 "$DECRYPTED_SEC_ENV"

cleanup() {
    rm -f "$DECRYPTED_SEC_ENV"
}
trap cleanup EXIT

# 3. Run only vault-init, no build, no dependencies
DECRYPTED_SEC_FILE="$DECRYPTED_SEC_ENV" \
docker compose -f docker-compose-dep.yml --env-file "$PLAIN_ENV" \
    run --rm --no-deps vault-init

