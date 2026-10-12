#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Paths — VERIFY these match your repo. They were referenced throughout the
# original script but never defined; with `set -u` the script aborts the first
# time it hits an undefined variable, so they must be set explicitly.
# ---------------------------------------------------------------------------
ENCRYPTED_SEC_ENV=".env.enc"                     # encrypted secrets (at rest)
DECRYPTED_SEC_ENV="/dev/shm/trans-secrets.env"   # decrypted at runtime (tmpfs)
PLAIN_ENV=".env"                             # non-secret vars for compose

# 1. Prompt for the passphrase once
read -rs -p "Vault bootstrap passphrase: " PASSPHRASE
echo

# 2. Clean up the decrypted secrets file on ANY exit.
#    Registered BEFORE decryption so a failed/partial decrypt can't leave a
#    plaintext secrets file lying around.
cleanup() { rm -f "$DECRYPTED_SEC_ENV"; }
trap cleanup EXIT

# 3. Decrypt .env.enc into /dev/shm.
#    The inline assignment exposes PASSPHRASE only to openssl's environment.
PASSPHRASE="$PASSPHRASE" \
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -salt \
    -in "$ENCRYPTED_SEC_ENV" \
    -out "$DECRYPTED_SEC_ENV" \
    -pass env:PASSPHRASE

# 4. Remove passphrase from the environment immediately
unset PASSPHRASE

# 5. Restrict permissions on the decrypted file
chmod 600 "$DECRYPTED_SEC_ENV"
chown 100:100 "$DECRYPTED_SEC_ENV"

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
if [ -n "${SUDO_USER:-}" ]; then
    export HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
fi

# 9. Prepare build cache directories for services using local cache
CACHE_BASE="$HOME/goinfre/trans_cache"
mkdir -p "$CACHE_BASE"

# Services that use cache_from/cache_to
CACHE_SERVICES=(postgres vault-init vault chess_engine stockfish_ai \
    backend_django timeout_checker frontend_nginx backup)

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
chmod 700 "$BACKUP_DATA_DIR/restic-repo"

# 11. Prepare Prometheus + Grafana data directories
#     Prometheus runs as UID 65534 (nobody), Grafana as UID 472.
#     mkdir BEFORE chown so it works on a fresh machine, and use 472:472
#     (not 472:0) so Grafana's dir doesn't depend on the root group.
PROMETHEUS_DATA_DIR="$HOME/goinfre/trans_data/trans_prometheus_data"
GRAFANA_DATA_DIR="$HOME/goinfre/trans_data/trans_grafana_data"
mkdir -p "$PROMETHEUS_DATA_DIR"
mkdir -p "$GRAFANA_DATA_DIR"
chown -R 65534:65534 "$PROMETHEUS_DATA_DIR"
chown -R 472:472     "$GRAFANA_DATA_DIR"
chmod 750 "$PROMETHEUS_DATA_DIR"
chmod 750 "$GRAFANA_DATA_DIR"

# 12. Run docker compose (main stack + monitoring overlay) with inline env var.
#     Only vault-init receives DECRYPTED_SEC_FILE via compose; all other
#     services use PLAIN_ENV for non-secrets.
#
#     NOTE: dropping the monitoring overlay into the SAME compose command means
#     the overlay's trans_net must NOT be `external: true` — it now belongs to
#     this project. In monitoring/docker-compose.monitoring.yml change the
#     bottom block from:
#         networks:
#           trans_net:
#             external: true
#     to just:
#         networks:
#           trans_net:
#
#     Also: Grafana/Postgres-exporter need GRAFANA_ADMIN_PASSWORD and
#     MONITOR_PASS resolvable by compose. Either put them in $PLAIN_ENV, or add
#     a second `--env-file "$DECRYPTED_SEC_ENV"` below so they come from your
#     encrypted secrets. (A second --env-file only feeds ${VAR} interpolation;
#     it does not inject those vars into every container.)
DECRYPTED_SEC_FILE="$DECRYPTED_SEC_ENV" \
    docker compose \
    -f docker-compose.yml \
    -f monitoring/docker-compose.monitoring.yml \
    --env-file "$PLAIN_ENV" \
    up -d --build "$@"

