#!/usr/bin/env bash
# Rewrites the machine-specific (IP-derived) values in the env files for
# whatever host this repo is currently checked out on.
#
# Both .env and .env.dep are rewritten. Previously only .env.dep was, which left
# the dev stack pointing at a stale address after the project moved machines --
# nginx's healthcheck, Django's ALLOWED_HOSTS and the CORS/CSRF origins all
# silently referred to a host that no longer existed.
set -euo pipefail

IP=$(hostname -I | awk '{print $1}')
DOMAIN="${IP}.nip.io"

ENV_FILES=("$@")
if [ ${#ENV_FILES[@]} -eq 0 ]; then
	ENV_FILES=(.env .env.dep)
fi

for f in "${ENV_FILES[@]}"; do
	[ -f "$f" ] || { echo "skip ${f} (not found)"; continue; }
	sed -i \
	  -e "s|SERVER_IP=.*|SERVER_IP=${IP}|" \
	  -e "s|FRONTEND_URL=.*|FRONTEND_URL=http://${DOMAIN}:3000|" \
	  -e "s|BACKEND_URL=.*|BACKEND_URL=http://${DOMAIN}:9000|" \
	  -e "s|MAILPIT_URL=.*|MAILPIT_URL=http://${DOMAIN}:8025|" \
	  -e "s|SITE_DOMAIN=.*|SITE_DOMAIN=${DOMAIN}:9000|" \
	  -e "s|CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=http://${DOMAIN}:3000|" \
	  -e "s|CSRF_TRUSTED_ORIGINS=.*|CSRF_TRUSTED_ORIGINS=http://${DOMAIN}:3000|" \
	  -e "s|ALLOWED_HOSTS=.*|ALLOWED_HOSTS=localhost,127.0.0.1,${IP},${DOMAIN},trans_backend_django|" \
	  -e "s|FT_REDIRECT_URI=.*|FT_REDIRECT_URI=http://${DOMAIN}:9000/api/auth/42/callback/|" \
	  -e "s|GOOGLE_REDIRECT_URI=.*|GOOGLE_REDIRECT_URI=http://${DOMAIN}:9000/api/auth/google/callback/|" \
	  "$f"
	echo "Updated ${f} for ${DOMAIN}"
done

echo
echo "NOTE: the OAuth redirect URIs were rewritten to match this host. They must"
echo "      also be re-registered in the 42 and Google developer consoles, or the"
echo "      providers will reject the callback."
