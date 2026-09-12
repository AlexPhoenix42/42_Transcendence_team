#!/usr/bin/env sh
set -e

# Get the dir where this script is located
#SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load .env
if [ -f /app/.env ]; then
	set -a
	. /app/.env
	set +a
else
	echo ".env file not found at /app/.env"
	exit 1
fi

# Change to project root so docker compose commands work
#cd "$PROJECT_ROOT"

# Wait for Vault
echo "Waiting for Vault..."
until vault status > /dev/null 2>&1; do
	sleep 2
done

# Django
vault kv put secret/django secret_key="$SECRET_KEY"

# Database credentials
vault kv put secret/database \
	user="$DB_SERVER_USER" password="$DB_SERVER_PASS"

# OAuth 42
vault kv put secret/oauth/42 \
	client_id="$FT_CLIENT_ID" client_secret="$FT_CLIENT_SECRET"

# OAuth Google
vault kv put secret/oauth/google \
	client_id="$GOOGLE_CLIENT_ID" client_secret="$GOOGLE_CLIENT_SECRET"

echo "All secrets stored successfully."

