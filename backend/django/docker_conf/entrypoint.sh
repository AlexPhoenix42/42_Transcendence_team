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

# Plusieurs process Daphne, un par port (9000, 9001, ...) - un seul worker
# sature vite sous un afflux de connexions WS (test de charge : ~1000 salons x
# 8 joueurs). nginx les répartit en round-robin (voir l'upstream
# `pacman_backend` dans frontend/docker_conf/nginx.local.conf). Le verrou
# Redis distribué + l'ownership de `_sync_loop` (pacman_game/consumers.py)
# sont ce qui rend ça sûr entre process - sans eux, N workers = N boucles de
# synchro et des races sur l'état Redis d'un même salon.
DAPHNE_WORKERS="${DAPHNE_WORKERS:-4}"

# Supervise un port : redémarre Daphne s'il crashe, en repartant du code
# bind-monté (donc les changements de code sont repris), comme la version
# à un seul worker. Piège TERM/INT sur SON PROPRE daphne courant ($pid change
# à chaque redémarrage, d'où le trap à l'intérieur de la fonction).
supervise_worker() {
	local port="$1"
	local pid=""
	trap 'kill -TERM "$pid" 2>/dev/null; exit 0' TERM INT
	while true; do
		daphne -b 0.0.0.0 -p "$port" config.asgi:application &
		pid=$!
		wait "$pid"
		echo "Daphne on :$port exited, restarting..."
	done
}

WORKER_PIDS=()
# Ce shell est PID 1 : relaie l'arrêt à chaque superviseur de worker (qui
# relaie à son tour à son daphne courant), sinon `docker compose down`
# attendrait le kill forcé par Docker au lieu de s'arrêter proprement.
trap 'kill -TERM "${WORKER_PIDS[@]}" 2>/dev/null; wait; exit 0' TERM INT

for i in $(seq 0 $((DAPHNE_WORKERS - 1))); do
	supervise_worker $((9000 + i)) &
	WORKER_PIDS+=("$!")
done

wait
