#!/usr/bin/env bash
# scripts_dev/handle_certs.sh
# Ensures TLS certificates exist and are valid before containers start.
# Called from run_dep_secure.sh and up_dep_secure.sh.
#
# Requires: SERVER_IP environment variable
set -euo pipefail

CERT_DIR="./vault/certs"

if [ -z "${SERVER_IP:-}" ]; then
    echo "❌ SERVER_IP must be set before calling ensure_certs.sh" >&2
    exit 1
fi

mkdir -p "$CERT_DIR"

# Check if certs need (re)generation
NEED_VAULT_CERTS=false
NEED_NGINX_CERTS=false

if [ ! -f "$CERT_DIR/ca-cert.pem" ] || [ ! -f "$CERT_DIR/vault-cert.pem" ]; then
    NEED_VAULT_CERTS=true
elif ! openssl x509 -in "$CERT_DIR/vault-cert.pem" -checkend 86400 -noout >/dev/null 2>&1; then
    echo "⚠️  Vault certificate expires within 24h, regenerating..."
    NEED_VAULT_CERTS=true
fi

if [ ! -f "$CERT_DIR/nginx-cert.pem" ]; then
    NEED_NGINX_CERTS=true
elif ! openssl x509 -in "$CERT_DIR/nginx-cert.pem" -checkend 86400 -noout >/dev/null 2>&1; then
    echo "⚠️  nginx certificate expires within 24h, regenerating..."
    NEED_NGINX_CERTS=true
fi

# Regenerating CA/vault certs invalidates nginx cert (signed by the old CA)
if [ "$NEED_VAULT_CERTS" = true ]; then
    NEED_NGINX_CERTS=true
fi

if [ "$NEED_VAULT_CERTS" = true ]; then
    echo "🔐 Generating Vault CA and server certificates..."
    CERT_DIR="$CERT_DIR" sh vault-init/gen_vault_cert.sh
fi

if [ "$NEED_NGINX_CERTS" = true ]; then
    echo "🔐 Generating nginx certificate..."
    CERT_DIR="$CERT_DIR" SERVER_IP="$SERVER_IP" sh vault-init/gen_nginx_cert.sh
fi

chown -R 100:100 "$CERT_DIR"

echo "✅ Certificates ready."

