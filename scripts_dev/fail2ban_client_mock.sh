#!/usr/bin/env bash
# fail2ban_attacker.sh — Generate brute-force traffic against Transcendence.
# Run this from a machine OTHER than the Docker host.
#
# Usage:
#   ./fail2ban_attacker.sh SERVER_IP [options]
#
# Options:
#   --port PORT        HTTPS port (default 4443)
#   --attempts N       Number of requests (default 6)
#   --delay SEC        Delay between requests (default 0.5)
#   --until-banned     Keep sending until the connection is refused
#   --test             Send a single request and report the result
#   --ip-only          Just print this machine's LAN IP and exit
#   --quiet            Skip the banner

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────
SERVER_IP=""
PORT=4443
ATTEMPTS=6
DELAY=0.5
UNTIL_BANNED=0
TEST_ONLY=0
QUIET=0
IP_ONLY=0

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[38;5;220m'
BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
ATTACK="⚔️"; CHECK="✅"; CROSS="❌"; EYES="👀"

usage() {
	cat <<EOF
Usage: $0 SERVER_IP [options]

Options:
  --port PORT        HTTPS port (default: 4443)
  --attempts N       Number of requests (default: 6)
  --delay SEC        Delay between requests (default: 0.5)
  --until-banned     Keep sending until the connection is refused
  --test             Send a single request and report the result
  --ip-only          Print this machine's LAN IP and exit
  --quiet            Skip the banner
  -h, --help         Show this help

Examples:
  $0 192.168.1.10
  $0 192.168.1.10 --until-banned
  $0 192.168.1.10 --test
EOF
}

# ── Arg parsing ─────────────────────────────────────────────────
while [ $# -gt 0 ]; do
	case "$1" in
		--port)         PORT="$2"; shift 2 ;;
		--attempts)     ATTEMPTS="$2"; shift 2 ;;
		--delay)        DELAY="$2"; shift 2 ;;
		--until-banned) UNTIL_BANNED=1; shift ;;
		--test)         TEST_ONLY=1; shift ;;
		--ip-only)      IP_ONLY=1; shift ;;
		--quiet)        QUIET=1; shift ;;
		-h|--help)      usage; exit 0 ;;
		-*)             echo "Unknown option: $1" >&2; usage; exit 1 ;;
		*)
			if [ -z "$SERVER_IP" ]; then
				SERVER_IP="$1"
			else
				echo "Unexpected argument: $1" >&2; usage; exit 1
			fi
			shift ;;
	esac
done

# ── Own IP detection ────────────────────────────────────────────
detect_ip() {
	local ip=""
	ip=$(ip route get 1.1.1.1 2>/dev/null \
		| awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1); exit}}')
	[ -z "$ip" ] && ip=$(hostname -I 2>/dev/null | awk '{print $1}')
	[ -z "$ip" ] && ip=$(ifconfig 2>/dev/null \
		| grep 'inet ' | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
	echo "${ip:-unknown}"
}

LOCAL_IP=$(detect_ip)

if [ "$IP_ONLY" -eq 1 ]; then
	echo "$LOCAL_IP"
	exit 0
fi

if [ -z "$SERVER_IP" ]; then
	echo "Error: SERVER_IP is required" >&2
	usage
	exit 1
fi

URL="https://${SERVER_IP}:${PORT}/api/login/"

# ── Banner ──────────────────────────────────────────────────────
if [ "$QUIET" -eq 0 ]; then
	printf "\n  ${ATTACK} ${BOLD}Brute-force simulator${RESET}\n"
	printf "  ─────────────────────────────────────\n"
	#printf "  ${EYES} My IP (that fail2ban will see): ${BOLD}%s${RESET}\n" "$LOCAL_IP"
	printf "  ${EYES} My LAN IP: ${BOLD}%s${RESET}\n" "$LOCAL_IP"
	printf "  ${EYES} Target: %s\n" "$URL"
	if [ "$TEST_ONLY" -eq 1 ]; then
		printf "  ${EYES} Mode: ${BOLD}single test${RESET}\n"
	elif [ "$UNTIL_BANNED" -eq 1 ]; then
		printf "  ${EYES} Mode: ${BOLD}until banned${RESET}\n"
	else
		printf "  ${EYES} Mode: ${BOLD}%d attempts${RESET}\n" "$ATTEMPTS"
	fi
	printf "\n"
fi

# ── Single request ──────────────────────────────────────────────
send_one() {
	local n="$1" code
	code=$(curl -sk -o /dev/null -w '%{http_code}' \
		--connect-timeout 5 --max-time 8 \
		-X POST "$URL" \
		-H "Content-Type: application/json" \
		-d "{\"username\":\"attacker\",\"password\":\"wrong_$n\"}" \
		2>/dev/null) || true
	echo "${code:-000}"
}

describe_code() {
	case "$1" in
		401) printf "${RED}401 Unauthorized${RESET}" ;;
		403) printf "${RED}403 Forbidden${RESET}" ;;
		429) printf "${YELLOW}429 Too Many Requests${RESET}" ;;
		000) printf "${RED}connection failed (000)${RESET}" ;;
		*)   printf "${DIM}%s${RESET}" "$1" ;;
	esac
}

# ── Test mode ───────────────────────────────────────────────────
if [ "$TEST_ONLY" -eq 1 ]; then
	printf "  ${ATTACK} single request → "
	CODE=$(send_one 1)
	describe_code "$CODE"
	printf "\n\n"
	if [ "$CODE" = "000" ]; then
		printf "  ${CHECK} ${GREEN}BANNED!${RESET} Connection refused/timed out.\n"
		exit 0
	else
		printf "  ${DIM}Request reached the server (not banned yet).${RESET}\n"
		exit 0
	fi
fi

# ── Until-banned mode ───────────────────────────────────────────
if [ "$UNTIL_BANNED" -eq 1 ]; then
	printf "  ${ATTACK} Sending until banned (max 100)...\n\n"
	MAX=100
	i=1
	while [ "$i" -le "$MAX" ]; do
		printf "  ${ATTACK} attempt %3d: " "$i"
		CODE=$(send_one "$i")
		describe_code "$CODE"
		printf "\n"
		if [ "$CODE" = "000" ]; then
			printf "\n  ${CHECK} ${GREEN}BANNED!${RESET} Your IP: %s\n\n" "$LOCAL_IP"
			exit 0
		fi
		i=$((i + 1))
		sleep "$DELAY"
	done
	printf "\n  ${CROSS} ${RED}Still not banned after %d attempts.${RESET}\n" "$MAX"
	printf "  ${DIM}Check fail2ban ignoreip and nginx logs on the server.${RESET}\n\n"
	exit 1
fi

# ── Fixed-attempts mode ─────────────────────────────────────────
printf "  ${ATTACK} Sending %d failed login requests...\n\n" "$ATTEMPTS"
for i in $(seq 1 "$ATTEMPTS"); do
	printf "  ${ATTACK} request %d/%d: " "$i" "$ATTEMPTS"
	CODE=$(send_one "$i")
	describe_code "$CODE"
	printf "\n"
	sleep "$DELAY"
done

printf "\n  ${CHECK} Attack sent.\n"
printf "  ${DIM}Your IP: %s${RESET}\n" "$LOCAL_IP"
printf "  ${DIM}Confirm the ban later with: %s %s --test${RESET}\n\n" "$0" "$SERVER_IP"

