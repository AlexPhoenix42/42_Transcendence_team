#!/usr/bin/env bash
set -euo pipefail

#PLAIN_ENV=".env"
PLAIN_ENV=".env.dep"
ENCRYPTED_SEC_ENV=".env.secrets.enc"
DECRYPTED_SEC_ENV="/dev/shm/trans.env"

export COMPOSE_FILE="docker-compose-dep.yml"

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

# Prepare Django media directory
mkdir -p backend/django/media
chown -R 1000:1000 backend/django/media
chmod 750 backend/django/media

# 6. Prepare Vault directories
mkdir -p vault/certs vault/approle vault/secrets
chown -R 100:100 vault/certs vault/approle vault/secrets
chmod 750 vault/certs vault/approle
chmod 700 vault/secrets

# 7. Prepare nginx log directory
mkdir -p frontend/logs/modsecurity
chown 101:101 frontend/logs/modsecurity
chmod 750 frontend/logs/modsecurity

# 8. If running with sudo, use the real user's home dir
if	[ -n "${SUDO_USER:-}" ]; then
	export HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
fi

# 9. Prepare build cache directories for services using local cache
CACHE_BASE="$HOME/goinfre/trans_cache"
mkdir -p "$CACHE_BASE"

# Services that use local build cache
CACHE_SERVICES=(postgres vault-init vault chess_engine stockfish_ai \
	backend_django timeout_checker frontend_nginx backup )

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

# 11. Prepare Prometheus + Grafana data directories
PROMETHEUS_DATA_DIR="$HOME/goinfre/trans_data/trans_prometheus_data"
GRAFANA_DATA_DIR="$HOME/goinfre/trans_data/trans_grafana_data"
mkdir -p "$PROMETHEUS_DATA_DIR" "$GRAFANA_DATA_DIR"
chown -R 65534:65534 "$PROMETHEUS_DATA_DIR"   # prometheus runs as UID 65534
chown -R 472:472     "$GRAFANA_DATA_DIR"       # grafana runs as UID 472
chmod 750 "$PROMETHEUS_DATA_DIR" "$GRAFANA_DATA_DIR"

# 12. Prepare white-board
mkdir -p whiteboard/data
chown -R 1000:1000 whiteboard/data
chmod 750 whiteboard/data

# frontend-react/dist/ must be rebuild since it is already in .gitignore
#cd frontend-react && npm run build && cd ..
sudo -u "${SUDO_USER:-$(whoami)}" sh -c 'cd frontend-react && npm run build'

# Auto-detect server IP and hostname
SERVER_IP=$(ip a | grep inet | awk 'NR==3 {print $2}' | cut -d/ -f1)
hostname=$(cut -d. -f1 < /sys/class/dmi/id/product_name)

if command -v tailscale >/dev/null 2>&1; then
	TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
fi

cp .env.dep.template .env.dep

sed -i "s/__SERVER_IP__/${SERVER_IP}/g" .env.dep
sed -i "s/__HOSTNAME__/${HOSTNAME}/g" .env.dep

if [ -n "$TAILSCALE_IP" ]; then
    sed -i "s/__TAILSCALE_IP__/${TAILSCALE_IP}/g" .env.dep
else
    sed -i "s/,__TAILSCALE_IP__//g" .env.dep
    sed -i "s/__TAILSCALE_IP__,//g" .env.dep
    sed -i "s/__TAILSCALE_IP__//g" .env.dep
fi

# Start Tailscale port forward for mobile access
if [ -n "$TAILSCALE_IP" ] && command -v socat >/dev/null 2>&1; then
    pkill -f "socat TCP-LISTEN:4444" >/dev/null 2>&1 || true
    socat TCP-LISTEN:4444,fork,bind=${TAILSCALE_IP} TCP:127.0.0.1:4443 &>/dev/null &
fi

# Build images in batches to avoid timeout
docker compose -f docker-compose-dep.yml --env-file "$PLAIN_ENV" --env-file "$DECRYPTED_SEC_ENV" \
    build postgres vault vault-init

docker compose -f docker-compose-dep.yml --env-file "$PLAIN_ENV" --env-file "$DECRYPTED_SEC_ENV" \
    build backend_django chess_engine stockfish_ai

docker compose -f docker-compose-dep.yml --env-file "$PLAIN_ENV" --env-file "$DECRYPTED_SEC_ENV" \
    build frontend_nginx timeout_checker backup

# Start everything
DECRYPTED_SEC_FILE="$DECRYPTED_SEC_ENV" \
    docker compose \
    -f docker-compose-dep.yml \
    --env-file "$PLAIN_ENV" \
    --env-file "$DECRYPTED_SEC_ENV" \
    up -d "$@"

