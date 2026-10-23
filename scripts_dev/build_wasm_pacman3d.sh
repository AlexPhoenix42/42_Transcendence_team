#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACMAN_DIR="$PROJECT_ROOT/frontend-apps/games/pacman3d"
DIST_DIR="$PROJECT_ROOT/frontend-react/dist/games/pacman3d"

make -C "$PACMAN_DIR" setup
make -C "$PACMAN_DIR" build

mkdir -p "$DIST_DIR"
cp -r "$PACMAN_DIR/src/build/web/"* "$DIST_DIR/"

echo "✅ Pacman 3D WASM build copied to $DIST_DIR"

