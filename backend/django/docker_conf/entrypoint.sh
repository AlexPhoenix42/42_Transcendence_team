#!/usr/bin/env bash
set -e

echo "Waiting for postgres at ${DB_HOST}:${DB_PORT}..."
while ! nc -z "$DB_HOST" "$DB_PORT"; do
	sleep 0.5
done
echo "Postgres is up."

echo "Waiting for redis at ${REDIS_HOST}:${REDIS_PORT}..."
while ! nc -z "$REDIS_HOST" "$REDIS_PORT"; do
	sleep 0.5
done
echo "Redis is up."

echo "Waiting for Vault at vault:8200..."
while ! nc -z vault 8200; do
	sleep 2
done
echo "Vault is reachable."

mkdir -p /django/media/avatars && cp -n /django/staticfiles/avatars/default_avatar.png /django/media/avatars/default_avatar.png

#python3 manage.py migrate --noinput

_migrate_attempt=0
while true; do
	if python3 manage.py migrate --noinput 2>&1; then
		break
	fi
	_migrate_attempt=$((_migrate_attempt+1))
	if [ $_migrate_attempt -ge 20 ]; then
		echo "❌ migrate failed after 20 attempts"
		exit 1
	fi
	echo "⚠️  migrate attempt $_migrate_attempt/20 failed, retrying in 10s..."
	sleep 10
done

python3 manage.py collectstatic --noinput
python3 manage.py ensure_ai_users
python3 manage.py shell -c "from django.contrib.auth import get_user_model; get_user_model().objects.filter(is_online=True).update(is_online=False); print('✅ Online status reset.')"

# Run custom command if provided (e.g. docker run ... python manage.py createsuperuser)
if [ "$#" -gt 0 ]; then
    exec "$@"
fi

# Forward stop/interrupt signals to the running Daphne process so
# `docker compose stop`/`down` shuts the container down cleanly instead
# of hanging until Docker force-kills it.
trap '[ -n "$DAPHNE_PID" ] && kill -TERM "$DAPHNE_PID" 2>/dev/null; exit 0' TERM INT

# Supervising loop: this shell (not Daphne) is PID 1. Daphne runs as a
# child process underneath it. Killing Daphne alone (e.g. `docker compose
# exec backend_django pkill daphne`) does NOT stop the container -- this
# loop notices Daphne exited and immediately starts a fresh one, picking
# up any code changes from the bind-mounted /django. Nothing here restarts
# automatically; a restart only happens when you kill Daphne yourself.
while true; do
	daphne -b 0.0.0.0 -p 9000 config.asgi:application &
	DAPHNE_PID=$!
	wait "$DAPHNE_PID"
	EXIT_CODE=$?
	echo "⚠️ Daphne exited with code $EXIT_CODE at $(date -Iseconds), restarting in 2s..."
	sleep 2
done

