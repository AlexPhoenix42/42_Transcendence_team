#!/usr/bin/env bash
# Lance TOUT en une fenêtre, avec les logs des deux serveurs à l'écran :
#   [front] = serveur web (live-reload, sert lobby.html + le jeu)
#   [back]  = Django/daphne (WebSocket, API)
#
#   ./scripts/dev-all.sh                 # accessible depuis le réseau local (défaut)
#   LOCAL=1 ./scripts/dev-all.sh         # localhost uniquement
#
# Redis doit tourner (redis-cli ping). Ctrl-C arrête les deux.
set -euo pipefail
cd "$(dirname "$0")/.."

REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
PORT_FRONT="${PORT_FRONT:-3000}"
PORT_BACK="${PORT_BACK:-8000}"
# Par défaut le backend écoute sur toutes les interfaces (jeu en LAN à 2 PC).
BIND_BACK=0.0.0.0
[ "${LOCAL:-0}" = "1" ] && BIND_BACK=127.0.0.1

if ! redis-cli -h "$REDIS_HOST" ping >/dev/null 2>&1; then
    echo "⚠  Redis injoignable sur $REDIS_HOST:6379 — démarre-le d'abord." >&2
    exit 1
fi

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"; : "${LAN_IP:=localhost}"
HOST=localhost; [ "${LOCAL:-0}" = "1" ] || HOST="$LAN_IP"
echo "🎮  Menu   : http://$HOST:$PORT_FRONT/"
echo "    Lobby  : http://$HOST:$PORT_FRONT/lobby.html"
echo "    Jeu    : http://$HOST:$PORT_FRONT/src/index.html?room=test&role=pacman"
echo "    (pare-feu : sudo ufw allow $PORT_FRONT/tcp && sudo ufw allow $PORT_BACK/tcp)"
echo

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; wait 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# préfixe chaque ligne de log avec un tag
run() { local tag="$1"; shift; "$@" 2>&1 | sed -u "s/^/[$tag] /"; }

PORT="$PORT_FRONT" run front node scripts/dev-server.js &
pids+=($!)

( cd backend && REDIS_HOST="$REDIS_HOST" run back \
    ../.venv/bin/daphne -b "$BIND_BACK" -p "$PORT_BACK" \
    --access-log - pacman_server.asgi:application ) &
pids+=($!)

wait
