#!/usr/bin/env bash
set -euo pipefail

IP=$(hostname -I | awk '{print $1}')
DOMAIN="${IP}.nip.io"

sed -i \
  -e "s|SERVER_IP=.*|SERVER_IP=${IP}|" \
  -e "s|FRONTEND_URL=.*|FRONTEND_URL=http://${DOMAIN}:3000|" \
  -e "s|BACKEND_URL=.*|BACKEND_URL=http://${DOMAIN}:9000|" \
  -e "s|CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=http://${DOMAIN}:3000|" \
  -e "s|CSRF_TRUSTED_ORIGINS=.*|CSRF_TRUSTED_ORIGINS=http://${DOMAIN}:3000|" \
  -e "s|ALLOWED_HOSTS=.*|ALLOWED_HOSTS=localhost,127.0.0.1,${IP},${DOMAIN},trans_backend_django|" \
  .env

echo "Updated .env for ${DOMAIN}"

