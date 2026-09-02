#!/usr/bin/env bash
# Kill all background Vault log tail processes
pkill -f "logs -f vault" 2>/dev/null || true
pkill -f "docker-compose.*logs" 2>/dev/null || true
echo "✅ Vault log tails killed."
