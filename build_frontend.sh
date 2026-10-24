#!/usr/bin/env bash
set -euo pipefail

echo "🔑 Requesting sudo access..."
sudo rm -rf frontend-react/dist

cd frontend-react && npm run build && cd ..

sudo rm -rf frontend-apps/games/pacman3d/src/build
bash scripts_dev/build_wasm_pacman3d.sh

docker compose restart frontend_nginx 2>&1 || true
sleep 12

