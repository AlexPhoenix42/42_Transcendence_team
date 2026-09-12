#!/usr/bin/env bash
#
# fix-tailscale — recover from a hung tailscaled on Void Linux (runit)
#
# Detects whether tailscaled is wedged (uptime stuck at 0s, or multiple
# instances running), forcibly kills any stragglers, and restarts the
# runit service cleanly.

set -euo pipefail

SERVICE=tailscaled
SVC_DIR="/etc/sv/${SERVICE}"
STATE_DIR="/var/lib/tailscale"
RUN_DIR="/var/run/tailscale"

# --- pretty output -----------------------------------------------------------
c_red()   { printf '\033[31m%s\033[0m\n' "$*"; }
c_green() { printf '\033[32m%s\033[0m\n' "$*"; }
c_yel()   { printf '\033[33m%s\033[0m\n' "$*"; }
info()    { printf '[*] %s\n' "$*"; }
ok()      { c_green "[+] $*"; }
warn()    { c_yel   "[!] $*"; }
err()     { c_red   "[x] $*"; }

# --- must be root ------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
    err "This script must be run as root (use sudo)."
    exit 1
fi

# --- service must exist ------------------------------------------------------
if [[ ! -d "$SVC_DIR" ]]; then
    err "Runit service directory $SVC_DIR not found."
    err "Is the tailscale package installed?"
    exit 1
fi

# --- snapshot before ---------------------------------------------------------
info "Current tailscaled processes:"
pgrep -a tailscaled || echo "    (none)"
echo

info "Current runit status:"
sv status "$SERVICE" || true
echo

# --- detect multiple instances ----------------------------------------------
PIDS=($(pgrep -x tailscaled || true))
NUM=${#PIDS[@]}

if (( NUM > 1 )); then
    warn "Found $NUM tailscaled processes — this is likely the cause."
elif (( NUM == 1 )); then
    info "Exactly one tailscaled process (pid ${PIDS[0]})."
else
    warn "No tailscaled process is running."
fi

# --- detect wedged uptime ----------------------------------------------------
# sv status prints: "run: tailscaled: (pid 525) 0s; run: log: (pid 524) 0s"
STATUS_LINE="$(sv status "$SERVICE" 2>/dev/null || true)"
UPTIME="$(sed -n 's/.*(pid [0-9]*) \([0-9]*\)s.*/\1/p' <<<"$STATUS_LINE" | head -n1)"

if [[ -n "${UPTIME:-}" && "$UPTIME" -lt 2 ]]; then
    warn "Reported uptime is ${UPTIME}s — process may be wedged."
fi

# --- kill everything ---------------------------------------------------------
info "Sending SIGTERM to any tailscaled processes..."
pkill -x tailscaled 2>/dev/null || true

# give them a moment to exit cleanly
for _ in 1 2 3 4 5; do
    pgrep -x tailscaled >/dev/null || break
    sleep 1
done

if pgrep -x tailscaled >/dev/null; then
    warn "Processes still alive — sending SIGKILL."
    pkill -9 -x tailscaled 2>/dev/null || true
    sleep 1
fi

if pgrep -x tailscaled >/dev/null; then
    err "Failed to kill tailscaled; something is very wrong."
    pgrep -a tailscaled
    exit 1
fi
ok "All tailscaled processes are gone."

# --- clean up stale runtime artefacts ---------------------------------------
if [[ -S "$RUN_DIR/tailscaled.sock" ]]; then
    warn "Removing stale socket $RUN_DIR/tailscaled.sock"
    rm -f "$RUN_DIR/tailscaled.sock"
fi

# --- restart the runit service ----------------------------------------------
info "Restarting runit service '$SERVICE'..."
sv restart "$SERVICE" >/dev/null
sleep 2

# --- verify ------------------------------------------------------------------
STATUS_LINE="$(sv status "$SERVICE" 2>/dev/null || true)"
echo
info "New status: $STATUS_LINE"

NEW_UPTIME="$(sed -n 's/.*(pid [0-9]*) \([0-9]*\)s.*/\1/p' <<<"$STATUS_LINE" | head -n1)"
sleep 3
STATUS_LINE2="$(sv status "$SERVICE" 2>/dev/null || true)"
NEW_UPTIME2="$(sed -n 's/.*(pid [0-9]*) \([0-9]*\)s.*/\1/p' <<<"$STATUS_LINE2" | head -n1)"

if [[ -n "${NEW_UPTIME:-}" && -n "${NEW_UPTIME2:-}" && "$NEW_UPTIME2" -gt "$NEW_UPTIME" ]]; then
    ok "tailscaled is running and uptime is advancing."
else
    warn "Uptime did not advance as expected — check manually:"
    warn "    sudo sv status $SERVICE"
    warn "    sudo tailscale status"
fi

# --- final connectivity sanity check (best effort) ---------------------------
if command -v tailscale >/dev/null; then
    echo
    info "tailscale status:"
    tailscale status 2>&1 | sed 's/^/    /' || true
fi

echo
ok "Done."

