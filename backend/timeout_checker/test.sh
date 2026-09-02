#!/usr/bin/env bash
set -e

REDIS_DB=2
GAME_ID=999
TIMESTAMP=999999999  # ancient timestamp

echo "==> Checking container..."
if ! docker ps --format '{{.Names}}' | grep -q trans_timeout_checker; then
  echo "FAIL: trans_timeout_checker not running"
  exit 1
fi

echo "==> Inserting test game..."
docker compose exec -T redis redis-cli -n $REDIS_DB SADD active_games $GAME_ID > /dev/null
docker compose exec -T redis redis-cli -n $REDIS_DB SET "game:$GAME_ID" \
  '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","crnt_turn":1,"check":false,"checkmate":false,"status":"IN_PROGRESS","moves":[],"disconnected":{"2": '$TIMESTAMP'},"player1_id":1,"player2_id":2}' > /dev/null

echo "==> Waiting for checker..."
FOUND=0
for i in $(seq 1 15); do
  sleep 1
  if ! docker compose exec -T redis redis-cli -n $REDIS_DB EXISTS "game:$GAME_ID" | grep -q 1; then
    FOUND=1
    echo "Checker processed after $i seconds."
    break
  fi
done

if [ $FOUND -eq 0 ]; then
  echo "FAIL: game key still exists after 15s"
  docker compose exec -T redis redis-cli -n $REDIS_DB SREM active_games $GAME_ID > /dev/null
  docker compose exec -T redis redis-cli -n $REDIS_DB DEL "game:$GAME_ID" > /dev/null
  exit 1
fi

echo "==> Cleaning up..."
docker compose exec -T redis redis-cli -n $REDIS_DB SREM active_games $GAME_ID > /dev/null
docker compose exec -T redis redis-cli -n $REDIS_DB DEL "game:$GAME_ID" > /dev/null

echo "==> SUCCESS"

