#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACMAN_DIR="$PROJECT_ROOT/frontend-apps/games/pacman3d"
DIST_DIR="$PROJECT_ROOT/frontend-react/dist/games/pacman3d"

echo "📦 Installing Pacman 3D dependencies..."
make --no-print-directory -C "$PACMAN_DIR" setup

echo "🔨 Building Pacman 3D WASM..."
make --no-print-directory -C "$PACMAN_DIR" build > /dev/null 2>&1

mkdir -p "$DIST_DIR"
cp -r "$PACMAN_DIR/src/build/web/"* "$DIST_DIR/"

echo "✅ Pacman 3D WASM build ready"

