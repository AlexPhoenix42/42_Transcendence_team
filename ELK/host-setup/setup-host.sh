#!/bin/bash
# One-time VM host preparation for the ELK stack (Devops log management module).
# Installs the vm.max_map_count sysctl required by Elasticsearch and verifies it.
#
# Usage: ./ELK/host-setup/setup-host.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${SCRIPT_DIR}/99-elasticsearch.conf"
DST="/etc/sysctl.d/99-elasticsearch.conf"
REQUIRED=262144

echo "==> Installing ${DST}"
sudo install -m 644 -o root -g root "${SRC}" "${DST}"

echo "==> Reloading sysctl settings"
sudo sysctl --system >/dev/null

CURRENT="$(cat /proc/sys/vm/max_map_count)"
echo "==> vm.max_map_count is now: ${CURRENT}"

if [ "${CURRENT}" -lt "${REQUIRED}" ]; then
	echo "FAIL: expected at least ${REQUIRED}, got ${CURRENT}" >&2
	exit 1
fi

echo "OK: Elasticsearch mmap requirement satisfied."
echo "    Reboot the VM and re-run 'cat /proc/sys/vm/max_map_count' to confirm it persisted."
