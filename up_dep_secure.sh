#!/usr/bin/env bash
# up_dep_secure.sh
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

mkdir -p frontend-nginx/logs/modsecurity
chown 101:101 frontend-nginx/logs/modsecurity
chmod 750 frontend-nginx/logs/modsecurity

mkdir -p backend/django/staticfiles
chown -R 1000:1000 backend/django/staticfiles

mkdir -p backend/django/media
chown -R 1000:1000 backend/django/media
chmod 755 backend/django/media

mkdir -p backend/django/secrets
chmod 755 backend/django/secrets
cp /home/$SUDO_USER/goinfre/trans_sec/api_sec/deepl_api_key backend/django/secrets/deepl_api_key
chmod 600 backend/django/secrets/deepl_api_key
chown 1000:1000 backend/django/secrets/deepl_api_key

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

WBO_DATA_DIR="$HOME/goinfre/trans_data/wbo_data"
mkdir -p "$WBO_DATA_DIR"
chown -R 1000:1000 "$WBO_DATA_DIR"
chmod 750 "$WBO_DATA_DIR"

# 8. Generate .env from template
SERVER_IP=$(ping -c1 -W1 "$(cut -d. -f1 < /sys/class/dmi/id/product_name)" 2>/dev/null | head -1 | awk -F'[()]' '{print $2}') || true
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

# =============================================
# Generate certs if missing
SERVER_IP="$SERVER_IP" bash scripts_dev/handle_certs.sh
# =============================================

# 10. Load cached images if missing
IMAGES_CACHE="$HOME/goinfre/trans_cache/pulled-images.tar"
PULLED_IMAGES="redis:8-alpine axllent/mailpit lovasoa/wbo:latest prom/prometheus:latest prom/alertmanager:latest grafana/grafana:latest nginx/nginx-prometheus-exporter:latest prometheuscommunity/postgres-exporter:latest oliver006/redis_exporter:latest"

if ! docker image inspect redis:8-alpine >/dev/null 2>&1; then
    if [ -f "$IMAGES_CACHE" ]; then
        echo "📦 Loading cached images from disk..."
        docker load -i "$IMAGES_CACHE" 2>/dev/null || true
        _missing=0
        for img in $PULLED_IMAGES; do
            docker image inspect "$img" >/dev/null 2>&1 || _missing=1
        done
        if [ "$_missing" -eq 1 ]; then
            echo "⚠️  Cache incomplete, missing images will be pulled..."
            rm -f "$IMAGES_CACHE"
        fi
    fi
fi


# 11. Clean slate — stop stale containers before bringing up fresh
echo "🧹 Cleaning up old containers..."
docker compose -f docker-compose.yml down 2>/dev/null || true

# 12. Start everything (no build), phased
export DECRYPTED_SEC_FILE="$DECRYPTED_SEC_ENV"
COMPOSE="docker compose -f docker-compose.yml --env-file $PLAIN_ENV --env-file $DECRYPTED_SEC_ENV"

echo "⏳ Phase 0: Building chess engine..."
$COMPOSE run --rm engine-builder

echo "⏳ Phase 1: Starting foundation services..."
$COMPOSE up -d vault redis mailpit whiteboard
$COMPOSE up -d --wait --wait-timeout 120 redis mailpit whiteboard

echo "⏳ Phase 2: Initializing Vault..."
$COMPOSE run --rm vault-init

echo "⏳ Waiting for Vault to pass healthcheck..."
$COMPOSE up -d --wait --wait-timeout 120 vault

echo "⏳ Phase 3: Starting database..."
$COMPOSE up -d --wait --wait-timeout 3600 postgres

echo "⏳ Phase 4: Ensuring prometheus_monitor user..."
bash scripts_dev/setup_monitor_user.sh

echo "⏳ Phase 5: Starting application services..."
$COMPOSE up -d --wait --wait-timeout 3600 backend_django timeout_checker backup

echo "⏳ Phase 6: Starting frontend and monitoring..."
$COMPOSE up -d --wait --wait-timeout 3600 frontend_nginx chess_engine stockfish_ai
$COMPOSE up -d prometheus grafana alertmanager nginx-exporter postgres-exporter redis-exporter

# Phase 7: Verify backend is responding
echo "⏳ Waiting for backend to be ready..."
_n=0
until docker exec trans_frontend_nginx curl -sf -o /dev/null -H "Host: localhost" http://backend_django:9000/api/login/ 2>/dev/null; do
    _n=$((_n+1))
    if [ $_n -ge 150 ]; then
        break
    fi
    sleep 2
done
echo "✅ All services ready."

