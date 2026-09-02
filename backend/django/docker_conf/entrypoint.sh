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

"$@"

python3 manage.py migrate --noinput
python3 manage.py collectstatic --noinput

# Forward stop/interrupt signals to the running Daphne process so
# `docker compose stop`/`down` shuts the container down cleanly instead
# of hanging until Docker force-kills it.
trap 'kill -TERM "$DAPHNE_PID" 2>/dev/null; exit 0' TERM INT

# Supervising loop: this shell (not Daphne) is PID 1. Daphne runs as a
# child process underneath it. Killing Daphne alone (e.g. `docker compose
# exec backend_django pkill daphne`) does NOT stop the container -- this
# loop notices Daphne exited and immediately starts a fresh one, picking
# up any code changes from the bind-mounted /django. Nothing here restarts
# automatically; a restart only happens when you kill Daphne yourself.
while true; do
	#daphne -b 0.0.0.0 -p 9000 --access-log /dev/null -v 0 config.asgi:application &
	daphne -b 0.0.0.0 -p 9000 config.asgi:application &
	DAPHNE_PID=$!
	wait "$DAPHNE_PID"
	echo "Daphne exited, restarting..."
done

