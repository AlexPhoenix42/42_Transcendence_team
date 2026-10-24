#!/usr/bin/env bash
set -euo pipefail

echo "🔑 Requesting sudo access..."
sudo rm -rf frontend-react/dist

cd frontend-react && npm run build && cd ..

bash scripts_dev/build_wasm_pacman3d.sh

