#!/bin/sh
# ============================================================================
# firewall-agent.sh — Minimal privileged firewall agent
#
# This is the ONLY component with CAP_NET_ADMIN. It listens on a Unix
# socket and applies iptables rules on the DOCKER-USER chain.
#
# fail2ban does NOT touch iptables directly — it sends BAN/UNBAN commands
# here. If fail2ban is compromised, the attacker cannot modify firewall
# rules because fail2ban has no privileges. This script validates every
# command before executing it.
#
# Protocol (one command per connection, text over Unix socket):
#   Client sends:   BAN <ipv4>      or   UNBAN <ipv4>
#   Server replies: OK <detail>     or   REJECTED <reason>
#
# ~80 lines, fully auditable.
# ============================================================================

set -eu

SOCKET_PATH="/var/run/firewall-agent/firewall.sock"
CHAIN="DOCKER-USER"
LOG_TAG="firewall-agent"

log() {
	echo "$(date '+%Y-%m-%dT%H:%M:%S%z') [$LOG_TAG] $*"
}

# ── Connection handler mode ──────────────────────────────────────────────
# When called with --handle, stdin/stdout are the socket connection.
# socat forks this for each incoming connection.
# ─────────────────────────────────────────────────────────────────────────
if	[ "${1:-}" = "--handle" ]; then
	# Read exactly one line
	if	! read -r CMD IP JUNK; then
		echo "REJECTED empty_input"
		exit 0
	fi

	# ── Strict IPv4 validation ────────────────────────────────────────
    # Only dotted-quad, each octet 0-255. No shell injection possible.
	is_valid_ipv4() {
		_ip="$1"
		# Must match exactly N.N.N.N
		echo "$_ip" | grep -qxE '^([0-9]{1,3}\.){3}[0-9]{1,3}$' || return 1
		# Split and check each octet
		IFS='.' read -r _a _b _c _d <<EOF
$_ip
EOF

		[ "$_a" -le 255 ] 2>/dev/null && \
		[ "$_b" -le 255 ] 2>/dev/null && \
		[ "$_c" -le 255 ] 2>/dev/null && \
		[ "$_d" -le 255 ] 2>/dev/null
	}

	# Reject trailing junk (only "CMD IP" accepted, nothing more)
	if	[ -n "${JUNK:-}" ]; then
		log		"REJECTED trailing junk from input"
		echo	"REJECTED trailing_junk"
		exit 0
	fi

	if	[ -z "${CMD:-}" ] || [ -z "${IP:-}" ]; then
		log		"REJECTED missing command or IP"
		echo	"REJECTED missing_fields"
		exit 0
	fi

	if	! is_valid_ipv4 "$IP"; then
		log		"REJECTED invalid IP: $IP"
		echo	"REJECTED invalid_ip"
		exit 0
	fi

	# ── Execute validated command ─────────────────────────────────────
	case "$CMD" in
		BAN)
			if	iptables -C "$CHAIN" -s "$IP" -j DROP 2>/dev/null; then
				log		"SKIP already banned: $IP"
				echo	"OK already_banned"
			else
				iptables -I "$CHAIN" -s "$IP" -j DROP
				log		"BANNED $IP"
				echo	"OK banned"
			fi
			;;
		UNBAN)
			if	iptables -C "$CHAIN" -s "$IP" -j DROP 2>/dev/null; then
				iptables -D "$CHAIN" -s "$IP" -j DROP
				log		"UNBANNED $IP"
				echo	"OK unbanned"
			else
				log		"SKIP not banned: $IP"
				echo	"OK not_banned"
			fi
			;;
		*)
			log		"REJECTED unknown command: $CMD"
			echo	"REJECTED unknown_command"
			;;
	esac
	exit 0
fi

# ── Daemon mode (default) ───────────────────────────────────────────────
# Ensure the DOCKER-USER chain exists (Docker creates it, but be safe)
if	! iptables -L "$CHAIN" -n >/dev/null 2>&1; then
	log	"WARNING: $CHAIN chain does not exist -> creating it..."
	iptables -N "$CHAIN" 2>/dev/null || true
fi

# Clean up stale socket
rm -f "$SOCKET_PATH"

log	"Started: listening on $SOCKET_PATH (chain: $CHAIN)"

# socat listens on the socket and forks this same script with --handle
# for each connection. mode=0660 restricts socket access.
exec	socat UNIX-LISTEN:"$SOCKET_PATH",mode=0660,fork,reuseaddr \
		EXEC:"$0 --handle",nofork

