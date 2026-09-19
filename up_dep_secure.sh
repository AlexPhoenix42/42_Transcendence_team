#!/usr/bin/env bash
set -euo pipefail

# Plain env file (non‑secrets)
PLAIN_ENV=".env.dep"
ENCRYPTED_SEC_ENV=".env.secrets.enc"
DECRYPTED_SEC_ENV="/dev/shm/trans.env"

# 1. Prompt for the passphrase once
read -s -p "Vault bootstrap passphrase: " PASSPHRASE
echo

# 2. Decrypt .env.secrets.enc to /dev/shm
PASSPHRASE="$PASSPHRASE" \
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
	-in		"$ENCRYPTED_SEC_ENV" \
	-out	"$DECRYPTED_SEC_ENV" \
	-pass	"env:PASSPHRASE"

# 3. Remove passphrase from environment immediately
unset PASSPHRASE

# 4. Restrict permissions on decrypted file
chmod 600 "$DECRYPTED_SEC_ENV"
chown 100:100 "$DECRYPTED_SEC_ENV"

# 5. Cleanup on exit
cleanup() { 
	rm -f "$DECRYPTED_SEC_ENV"
}
trap cleanup EXIT

# 6. Prepare Vault directories (runtime, not build)
mkdir -p vault/certs vault/approle vault/secrets
chown -R 100:100 vault/certs vault/approle vault/secrets
chmod 750 vault/certs vault/approle
chmod 700 vault/secrets

# 7. Prepare nginx log directory
mkdir -p frontend/logs/modsecurity
chown 101:101 frontend/logs/modsecurity
chmod 750 frontend/logs/modsecurity

# 8. Prepare backup data and restic repository (runtime)
BACKUP_DATA_DIR="$HOME/goinfre/trans_data/trans_backups"
# But we need HOME to be correct first, so export it now if sudo
if	[ -n "${SUDO_USER:-}" ]; then
	export HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
fi
BACKUP_DATA_DIR="$HOME/goinfre/trans_data/trans_backups"
mkdir -p "$BACKUP_DATA_DIR/restic-repo"
chown -R 100:100 "$BACKUP_DATA_DIR"
chmod 750 "$BACKUP_DATA_DIR"
chmod 700 "$BACKUP_DATA_DIR/restic-repo"

# Reset Vault health state (sealed after reboot, vault-init didn't restart)
docker compose -f docker-compose-dep.yml restart vault 2>/dev/null || true

# 9. Run docker compose (no --build)
DECRYPTED_SEC_FILE="$DECRYPTED_SEC_ENV" \
#docker compose -f docker-compose-dep.yml --env-file "$PLAIN_ENV" up -d "$@"

# the above line was edited here for Grafapha!
DECRYPTED_SEC_FILE="$DECRYPTED_SEC_ENV" \
    docker compose \
    -f docker-compose-dep.yml \
    --env-file "$PLAIN_ENV" \
    --env-file "$DECRYPTED_SEC_ENV" \
    up -d "$@"

#    -f monitoring/docker-compose.monitoring.yml \

