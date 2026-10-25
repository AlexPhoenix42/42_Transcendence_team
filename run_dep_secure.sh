#!/usr/bin/env bash
# run_dep_secure.sh
set -euo pipefail

PLAIN_ENV=".env"
ENCRYPTED_SEC_ENV=".env.secrets.enc"
DECRYPTED_SEC_ENV="/dev/shm/trans.env"

export COMPOSE_FILE="docker-compose.yml"

# If running with sudo, use the real user's home dir
if [ -n "${SUDO_USER:-}" ]; then
	export HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
fi

# 1. Prompt for the passphrase once
read -s -p "Vault bootstrap passphrase: " PASSPHRASE
echo
echo "📦 Installing dependencies and building (this may take a minute, please be patient)..."

# 2. Decrypt .env.enc to /dev/shm
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

# Prepare Django media directory
mkdir -p backend/django/staticfiles
chown -R 1000:1000 backend/django/staticfiles

mkdir -p backend/django/media
chown -R 1000:1000 backend/django/media
chmod 755 backend/django/media

mkdir -p backend/django/secrets
chown -R 1000:1000 backend/django/secrets
chmod 750 backend/django/secrets
rm -rf backend/django/secrets/deepl_api_key
cp /home/$SUDO_USER/goinfre/trans_sec/api_sec/deepl_api_key backend/django/secrets/deepl_api_key
chmod 600 backend/django/secrets/deepl_api_key
chown 1000:1000 backend/django/secrets/deepl_api_key

# 6. Prepare Vault directories
mkdir -p vault/certs vault/approle vault/secrets
chown -R 100:100 vault/certs vault/approle vault/secrets
chmod 750 vault/certs vault/approle
chmod 700 vault/secrets

# 7. Prepare nginx log directory
mkdir -p frontend-nginx/logs/modsecurity
chown 101:101 frontend-nginx/logs/modsecurity
chmod 750 frontend-nginx/logs/modsecurity

mkdir -p frontend-nginx/logs/nginx
chown 101:101 frontend-nginx/logs/nginx
chmod 750 frontend-nginx/logs/nginx

# 9. Prepare build cache directories for services using local cache
CACHE_BASE="$HOME/goinfre/trans_cache"
mkdir -p "$CACHE_BASE"

CACHE_SERVICES=(postgres vault-init vault chess_engine stockfish_ai \
	backend_django timeout_checker frontend_nginx backup \
	fail2ban firewall-agent)

for service in "${CACHE_SERVICES[@]}"; do
	mkdir -p "$CACHE_BASE/$service"
done

if [ -n "${SUDO_USER:-}" ]; then
	chown -R "$SUDO_USER:$(id -gn "$SUDO_USER")" "$CACHE_BASE"
else
	chown -R "$(whoami):$(id -gn)" "$CACHE_BASE"
fi

# 10. Prepare backup data and restic repository
BACKUP_DATA_DIR="$HOME/goinfre/trans_data/trans_backups"
mkdir -p "$BACKUP_DATA_DIR/restic-repo"
chown -R 100:100 "$BACKUP_DATA_DIR"
chmod 750 "$BACKUP_DATA_DIR"
chmod 750 "$BACKUP_DATA_DIR/restic-repo"

# 11. Prepare Prometheus + Grafana data directories
PROMETHEUS_DATA_DIR="$HOME/goinfre/trans_data/trans_prometheus_data"
GRAFANA_DATA_DIR="$HOME/goinfre/trans_data/trans_grafana_data"
mkdir -p "$PROMETHEUS_DATA_DIR" "$GRAFANA_DATA_DIR"
chown -R 65534:65534 "$PROMETHEUS_DATA_DIR"
chown -R 472:472     "$GRAFANA_DATA_DIR"
chmod 750 "$PROMETHEUS_DATA_DIR" "$GRAFANA_DATA_DIR"

# 12. Prepare white-board
WBO_DATA_DIR="$HOME/goinfre/trans_data/wbo_data"
mkdir -p "$WBO_DATA_DIR"
chown -R 1000:1000 "$WBO_DATA_DIR" 
chmod 750 "$WBO_DATA_DIR" 

# 13. Ensure nvm, Node.js 20+, and sfw are available
REAL_USER="${SUDO_USER:-$(whoami)}"
sudo -u "$REAL_USER" bash -c '
    # Find nvm wherever it may be
    export NVM_DIR="${HOME}/.nvm"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        export NVM_DIR="${HOME}/.local/share/nvm"
    fi

    # Install nvm if not found anywhere
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        echo "📦 Installing nvm..."
        export NVM_DIR="${HOME}/.nvm"
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    fi

    . "$NVM_DIR/nvm.sh"

	# Use current default if 20+, otherwise install LTS
    NODE_VER=$(nvm current 2>/dev/null | sed "s/v//" | cut -d. -f1)
    if [ -z "$NODE_VER" ] || [ "$NODE_VER" = "none" ]  || [ "$NODE_VER" = "system" ]|| [ "$NODE_VER" -lt 20 ]; then
        nvm install --lts > /dev/null 2>&1
        nvm use --lts > /dev/null 2>&1
        nvm alias default lts/* > /dev/null 2>&1
    else
        nvm use default > /dev/null 2>&1
    fi

    # Install sfw if missing
    if ! command -v sfw >/dev/null 2>&1; then
        echo "📦 Installing sfw..."
        npm install -g sfw
    fi
'

# 14. Build frontend
sudo rm -rf frontend-react/dist/*
sudo -u "$REAL_USER" bash -c '
    export NVM_DIR="${HOME}/.nvm"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
        export NVM_DIR="${HOME}/.local/share/nvm"
    fi
    . "$NVM_DIR/nvm.sh"
    cd frontend-react && sfw npm install && npm run build'

# 15. Build Pacman 3D
sudo -u "$REAL_USER" bash scripts_dev/build_wasm_pacman3d.sh

# Auto-detect server IP and hostname
#SERVER_IP=$(ip a | grep inet | awk 'NR==3 {print $2}' | cut -d/ -f1)
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

# Start Tailscale port forward for mobile access
if [ -n "$TAILSCALE_IP" ] && command -v socat >/dev/null 2>&1; then
    pkill -f "socat TCP-LISTEN:4444" >/dev/null 2>&1 || true
    socat TCP-LISTEN:4444,fork,bind=${TAILSCALE_IP} TCP:127.0.0.1:4443 &>/dev/null &
fi

# =============================================
# Generate certs if missing
SERVER_IP="$SERVER_IP" bash scripts_dev/handle_certs.sh
# =============================================

# Cache pulled images to disk
IMAGES_CACHE="$HOME/goinfre/trans_cache/pulled-images.tar"
PULLED_IMAGES="redis:8-alpine axllent/mailpit lovasoa/wbo:latest prom/prometheus:latest prom/alertmanager:latest grafana/grafana:latest nginx/nginx-prometheus-exporter:latest prometheuscommunity/postgres-exporter:latest oliver006/redis_exporter:latest"

# Load from cache if images are missing
if [ -f "$IMAGES_CACHE" ]; then
    echo "📦 Loading images from repo..."
    #echo "📦 Loading cached images from disk..."
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


# Build images in batches to avoid timeout
echo "🔨 Building Docker images..."
docker compose -f docker-compose.yml --env-file "$PLAIN_ENV" --env-file "$DECRYPTED_SEC_ENV" \
    build postgres vault vault-init

docker compose -f docker-compose.yml --env-file "$PLAIN_ENV" --env-file "$DECRYPTED_SEC_ENV" \
    build backend_django chess_engine stockfish_ai

docker compose -f docker-compose.yml --env-file "$PLAIN_ENV" --env-file "$DECRYPTED_SEC_ENV" \
    build frontend_nginx timeout_checker backup

docker compose -f docker-compose.yml --env-file "$PLAIN_ENV" --env-file "$DECRYPTED_SEC_ENV" \
    build fail2ban firewall-agent


export DECRYPTED_SEC_FILE="$DECRYPTED_SEC_ENV"

COMPOSE="docker compose -f docker-compose.yml --env-file $PLAIN_ENV --env-file $DECRYPTED_SEC_ENV"

# Phase 0: Build chess engine (one-shot, exits when done)
echo "⏳ Phase 0: Building chess engine..."
$COMPOSE run --rm engine-builder

# Phase 1: Foundation — start vault (won't be healthy until init), wait for the rest
echo "⏳ Phase 1: Starting foundation services..."
$COMPOSE up -d vault redis mailpit whiteboard
$COMPOSE up -d --wait --wait-timeout 120 redis mailpit whiteboard

# Phase 2: Vault init (initializes + unseals vault)
echo "⏳ Phase 2: Initializing Vault..."
$COMPOSE run --rm vault-init

# Wait for vault healthcheck now that it's initialized
echo "⏳ Waiting for Vault to pass healthcheck..."
$COMPOSE up -d --wait --wait-timeout 120 vault

# Phase 3: Database
echo "⏳ Phase 3: Starting database..."
$COMPOSE up -d --wait --wait-timeout 3600 postgres

# Phase 4: Monitoring user
echo "⏳ Phase 4: Setup prometheus_monitor user..."
bash scripts_dev/setup_monitor_user.sh

# Phase 5: App layer
echo "⏳ Phase 5: Starting application services..."
$COMPOSE up -d --wait --wait-timeout 3600 backend_django timeout_checker backup

# Phase 6: Frontend + chess + monitoring
echo "⏳ Phase 6: Starting frontend and monitoring..."
$COMPOSE up -d --wait --wait-timeout 3600 frontend_nginx chess_engine stockfish_ai
$COMPOSE up -d prometheus grafana alertmanager nginx-exporter postgres-exporter redis-exporter

# this is moved here because of the --wait in the phase 7
echo "⏳ Waiting for backend to be ready..."

# Phase 7: Security — fail2ban + firewall agent
echo "⏳ Phase 7: Starting security services..."
$COMPOSE up -d --wait --wait-timeout 3600 firewall-agent fail2ban

# Save pulled images to disk cache
if [ ! -f "$IMAGES_CACHE" ]; then
    docker save $PULLED_IMAGES -o "$IMAGES_CACHE" 2>/dev/null || true
fi

# Phase 8: Verify backend is responding
#echo "⏳ Waiting for backend to be ready..."
_n=0
until docker exec trans_frontend_nginx curl -sf -o /dev/null -H "Host: localhost" http://backend_django:9000/api/login/ 2>/dev/null; do
    _n=$((_n+1))
    if [ $_n -ge 150 ]; then
        break
    fi
    sleep 2
done
echo "✅ All services ready."

