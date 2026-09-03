#!/usr/bin/env bash
set -euo pipefail

#PLAIN_ENV=".env"
PLAIN_ENV=".env.dep"
ENCRYPTED_SEC_ENV=".env.secrets.enc"
DECRYPTED_SEC_ENV="/dev/shm/trans.env"

# 1. Prompt for the passphrase once
read -s -p "Vault bootstrap passphrase: " PASSPHRASE
echo

# 2. Decrypt .env.enc to /dev/shm
# inline env var passes PARAPHRASE only to openssl
PASSPHRASE="$PASSPHRASE" \
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
	-in		"$ENCRYPTED_SEC_ENV" \
	-out	"$DECRYPTED_SEC_ENV" \
	-pass	"env:PASSPHRASE"

# 3. Remove passphrase from environemnt immediately
unset PASSPHRASE

# 4. Restrict permissions on decrypted file
chmod 600 "$DECRYPTED_SEC_ENV"
chown 100:100 "$DECRYPTED_SEC_ENV"

# 5. Cleanup on exit
cleanup() { 
	rm -f "$DECRYPTED_SEC_ENV"
}
trap cleanup EXIT

# 6. Prepare Vault directories
mkdir -p vault/certs vault/approle vault/secrets
chown -R 100:100 vault/certs vault/approle vault/secrets
chmod 750 vault/certs vault/approle
chmod 700 vault/secrets

# 7. Prepare nginx log directory
mkdir -p frontend/logs/modsecurity
chown 101:101 frontend/logs/modsecurity
# 755, not 750: nginx (uid 101) writes the audit log here, but Logstash reads it
# as uid 1000 and is in neither that user nor group. With 750 it cannot even
# traverse the directory, so logs-modsecurity-* stays empty with no error
# anywhere. The audit.log file itself is created 0644 by ModSecurity, so
# widening only the directory bit is enough.
chmod 755 frontend/logs/modsecurity

# 8. If running with sudo, use the real user's home dir
if	[ -n "${SUDO_USER:-}" ]; then
	export HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
fi

# 9. Prepare build cache directories for services using local cache
CACHE_BASE="$HOME/goinfre/trans_cache"
mkdir -p "$CACHE_BASE"

# Services that use local build cache
CACHE_SERVICES=(postgres vault-init vault chess_engine stockfish_ai \
	backend_django timeout_checker frontend_nginx backup)

# Add one directory per service that uses cache_from/cache_to
for service in "${CACHE_SERVICES[@]}"; do
	mkdir -p "$CACHE_BASE/$service"
done

if	[ -n "${SUDO_USER:-}" ]; then
	chown -R "$SUDO_USER:$(id -gn "$SUDO_USER")" "$CACHE_BASE"
else
	chown -R "$(whoami):$(id -gn)" "$CACHE_BASE"
fi

# 10. Prepare backup data and restic repository
BACKUP_DATA_DIR="$HOME/goinfre/trans_data/trans_backups"
mkdir -p "$BACKUP_DATA_DIR/restic-repo"
chown -R 100:100 "$BACKUP_DATA_DIR"
chmod 750 "$BACKUP_DATA_DIR"
chmod 700 "$BACKUP_DATA_DIR/restic-repo"

# 10b. Prepare the ELK data directories and credentials file.
# Elasticsearch runs as uid 1000, so Docker must not create these bind mounts as
# root:root. The snapshot repo deliberately sits OUTSIDE $BACKUP_DATA_DIR --
# step 10's `chown -R 100:100` would otherwise take it away from ES every run.
./ELK/host-setup/prepare-elk-dirs.sh

# 11. Run docker compose with inline env var, no export
# only vault-init gets DECRYPTED_SEC_ENV via compose env.
# All services use plain .env for non-secrets.
DECRYPTED_SEC_FILE="$DECRYPTED_SEC_ENV" \
docker compose -f docker-compose-dep.yml --env-file "$PLAIN_ENV" up -d --build "$@"

