#!/usr/bin/env bash
set -euo pipefail

PLAIN_ENV=".env"
ENCRYPTED_SEC_ENV=".env.secrets.enc"
DECRYPTED_SEC_ENV="/dev/shm/trans.env"

# 1. Prompt for the passphrase once
read -s -p "Vault bootstrap passphrase: " PASSPHRASE
echo
echo "⏳ Setting up environment, please be patient..."

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

# 6. If running with sudo, use the real user's home dir
if [ -n "${SUDO_USER:-}" ]; then
	export HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
fi

# 7. Prepare directories
mkdir -p vault/certs vault/approle vault/secrets
chown -R 100:100 vault/certs vault/approle vault/secrets
chmod 750 vault/certs vault/approle
chmod 700 vault/secrets

mkdir -p frontend/logs/modsecurity
chown 101:101 frontend/logs/modsecurity
chmod 750 frontend/logs/modsecurity

mkdir -p backend/django/media
chown -R 1000:1000 backend/django/media
chmod 755 backend/django/media

BACKUP_DATA_DIR="$HOME/goinfre/trans_data/trans_backups"
mkdir -p "$BACKUP_DATA_DIR/restic-repo"
chown -R 100:100 "$BACKUP_DATA_DIR"
chmod 750 "$BACKUP_DATA_DIR"
chmod 700 "$BACKUP_DATA_DIR/restic-repo"

PROMETHEUS_DATA_DIR="$HOME/goinfre/trans_data/trans_prometheus_data"
GRAFANA_DATA_DIR="$HOME/goinfre/trans_data/trans_grafana_data"
mkdir -p "$PROMETHEUS_DATA_DIR" "$GRAFANA_DATA_DIR"
chown -R 65534:65534 "$PROMETHEUS_DATA_DIR"
chown -R 472:472     "$GRAFANA_DATA_DIR"
chmod 750 "$PROMETHEUS_DATA_DIR" "$GRAFANA_DATA_DIR"

mkdir -p whiteboard/data
chown -R 1000:1000 whiteboard/data
chmod 750 whiteboard/data

# 8. Generate .env from template
SERVER_IP=$(ping -c1 -W1 "$(cut -d. -f1 < /sys/class/dmi/id/product_name)" 2>/dev/null | head -1 | awk -F'[()]' '{print $2}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP=$(ip a | grep inet | awk 'NR==3 {print $2}' | cut -d/ -f1)
fi
HOSTNAME=$(cut -d. -f1 < /sys/class/dmi/id/product_name)
TAILSCALE_IP=""

if command -v tailscale >/dev/null 2>&1; then
	TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
fi

cp .env.template .env

sed -i "s/__SERVER_IP__/${SERVER_IP}/g" .env
sed -i "s/__HOSTNAME__/${HOSTNAME}/g" .env

if [ -n "$TAILSCALE_IP" ]; then
    sed -i "s/__TAILSCALE_IP__/${TAILSCALE_IP}/g" .env
else
    sed -i "s/,__TAILSCALE_IP__//g" .env
fi

# 9. Start Tailscale port forward for mobile access
if [ -n "$TAILSCALE_IP" ] && command -v socat >/dev/null 2>&1; then
    pkill -f "socat TCP-LISTEN:4444" >/dev/null 2>&1 || true
    socat TCP-LISTEN:4444,fork,bind=${TAILSCALE_IP} TCP:127.0.0.1:4443 &>/dev/null &
fi

# 10. Load cached images if missing
IMAGES_CACHE="$HOME/goinfre/trans_cache/pulled-images.tar"
PULLED_IMAGES="redis:8-alpine axllent/mailpit lovasoa/wbo:latest prom/prometheus:latest grafana/grafana:latest nginx/nginx-prometheus-exporter:latest prometheuscommunity/postgres-exporter:latest oliver006/redis_exporter:latest"

if ! docker image inspect redis:8-alpine >/dev/null 2>&1; then
    if [ -f "$IMAGES_CACHE" ]; then
        echo "📦 Loading cached images from disk..."
        docker load -i "$IMAGES_CACHE" 2>/dev/null || true
        docker rm _cache_test >/dev/null 2>&1 || true
        if ! docker create --name _cache_test lovasoa/wbo:latest true >/dev/null 2>&1; then
            echo "⚠️  Cached images are corrupted, cleaning up..."
            rm -f "$IMAGES_CACHE"
            for img in $PULLED_IMAGES; do
                docker rmi "$img" 2>/dev/null || true
            done
        else
            docker rm _cache_test >/dev/null 2>&1
        fi
    fi
fi

# 11. Clean slate — stop stale containers before bringing up fresh
docker compose -f docker-compose.yml down 2>/dev/null || true

# 12. Start everything (no build)
DECRYPTED_SEC_FILE="$DECRYPTED_SEC_ENV" \
    docker compose \
    -f docker-compose.yml \
    --env-file "$PLAIN_ENV" \
    --env-file "$DECRYPTED_SEC_ENV" \
    up -d "$@"

