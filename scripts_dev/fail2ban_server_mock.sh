#!/usr/bin/env bash
# fail2ban_server.sh — Server-side verification for fail2ban + firewall-agent.
# Pair with fail2ban_attacker.sh running on a different LAN machine.
#
# Usage:
#   sudo ./fail2ban_server.sh [--demos] [--attacker-ip IP]

set -euo pipefail

# ── Re-exec as root ──────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
	exec sudo "$0" "$@"
fi

# ── Config ───────────────────────────────────────────────────────
FAIL2BAN_CONTAINER="trans_fail2ban"
NGINX_CONTAINER="trans_frontend_nginx"
FW_CONTAINER="trans_firewall_agent"
JAIL="transcendence-auth"
BAN_TIMEOUT=90

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$SCRIPT_DIR}"
cd "$PROJECT_DIR"

SERVER_IP=$(grep -m1 'SERVER_IP=' .env 2>/dev/null | cut -d= -f2 || echo "localhost")
SERVER_IP="${SERVER_IP%\"}"; SERVER_IP="${SERVER_IP#\"}"

# ── Args ─────────────────────────────────────────────────────────
WITH_DEMOS=0
ATTACKER_IP=""
while [ $# -gt 0 ]; do
	case "$1" in
		--demos)       WITH_DEMOS=1; shift ;;
		--attacker-ip) ATTACKER_IP="$2"; shift 2 ;;
		-h|--help)
			cat <<EOF
Usage: sudo $0 [--demos] [--attacker-ip IP]

  --demos          Also run manual socket + input validation demos
  --attacker-ip IP Skip auto-detection of the attacker's IP
EOF
			exit 0 ;;
		*) echo "Unknown arg: $1"; exit 1 ;;
	esac
done

# ── Colors ───────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[38;5;220m'
CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; BOLD='\033[1m'
DIM='\033[2m'; RESET='\033[0m'
SHIELD="🛡️"; ATTACK="⚔️"; CHECK="✅"; CROSS="❌"
CLOCK="⏳"; EYES="👀"; UNLOCK="🔓"

step() { printf "\n  ${CYAN}${BOLD}── %s${RESET}\n\n" "$*"; }
info() { printf "  ${DIM}%s${RESET}\n" "$*"; }
ok()   { printf "  ${CHECK} ${GREEN}%s${RESET}\n" "$*"; }
bad()  { printf "  ${CROSS} ${RED}%s${RESET}\n" "$*"; }
warn() { printf "  ${CLOCK} ${YELLOW}%s${RESET}\n" "$*"; }
pause(){ printf "\n  ${DIM}Press Enter to continue...${RESET}"; read -r; }

# ── Pre-flight ───────────────────────────────────────────────────
printf "\n  ${SHIELD} ${BOLD}${MAGENTA}fail2ban server check${RESET}\n"
printf "  ${BOLD}────────────────────────────────────${RESET}\n"

step "Pre-flight"
for c in "$FAIL2BAN_CONTAINER" "$NGINX_CONTAINER" "$FW_CONTAINER"; do
	if ! docker inspect "$c" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
		bad "Container $c is not running"; exit 1
	fi
	ok "$c is running"
done

if ! docker exec "$FAIL2BAN_CONTAINER" test -S /var/run/firewall-agent/firewall.sock; then
	bad "firewall-agent socket not accessible"; exit 1
fi
ok "firewall-agent socket is accessible"

info "Current jail status:"
docker exec "$FAIL2BAN_CONTAINER" fail2ban-client status "$JAIL" 2>/dev/null || true

# ── Step 1: instructions ─────────────────────────────────────────
step "1. Start the attack from another LAN machine"
info "On the attacker machine run:"
printf "\n    ${BOLD}./fail2ban_attacker.sh %s${RESET}\n\n" "$SERVER_IP"
info "The attacker script will print its IP (the one fail2ban will see)."
pause

# ── Step 2: detect attacker IP ───────────────────────────────────
step "2. Detecting attacker IP from Nginx logs"

if [ -n "$ATTACKER_IP" ]; then
	ok "Using provided attacker IP: $ATTACKER_IP"
else
	info "Scanning recent 401/403 auth requests..."
	ATTACKER_IP=$(docker exec "$NGINX_CONTAINER" tail -200 /var/log/nginx/access.log 2>/dev/null \
		| grep -E '"POST /api/(login|register|auth)[^"]*" (401|403)' \
		| awk '{print $1}' \
		| grep -vxF "$SERVER_IP" \
		| sort | uniq -c | sort -rn | head -1 | awk '{print $2}' || true)

	if [ -z "$ATTACKER_IP" ]; then
		bad "Could not auto-detect attacker IP"
		info "Last 10 auth 401/403 lines:"
		docker exec "$NGINX_CONTAINER" tail -40 /var/log/nginx/access.log 2>/dev/null \
			| grep -E ' (401|403) ' | tail -10 || true
		printf "\n"
		info "Re-run with: sudo $0 --attacker-ip <IP>"
		exit 1
	fi
	ok "Detected attacker IP: $ATTACKER_IP"
fi

# Warn (don't reject) if it's a Docker-internal address
if echo "$ATTACKER_IP" | grep -qE '^(127\.|172\.(1[6-9]|2[0-9]|3[01])\.)'; then
	warn "Attacker IP is Docker-internal (likely the bridge gateway)."
	warn "fail2ban may ignore this IP if it's in ignoreip — check:"
	warn "  docker exec $FAIL2BAN_CONTAINER fail2ban-client get $JAIL ignoreip"
fi

# ── Step 3: poll for ban ─────────────────────────────────────────
step "3. Waiting for fail2ban to ban $ATTACKER_IP"

BANNED=0
for i in $(seq 1 "$BAN_TIMEOUT"); do
	if docker exec "$FAIL2BAN_CONTAINER" fail2ban-client status "$JAIL" 2>/dev/null \
		| grep -q "$ATTACKER_IP"; then
		BANNED=1; break
	fi
	printf "\r  ${CLOCK} polling... %d/%ds" "$i" "$BAN_TIMEOUT"
	sleep 1
done
printf "\r%s\r" "                                        "

if [ "$BANNED" -eq 1 ]; then
	ok "fail2ban banned $ATTACKER_IP"
	printf "\n"
	docker exec "$FAIL2BAN_CONTAINER" fail2ban-client status "$JAIL" 2>/dev/null || true
else
	bad "No ban after ${BAN_TIMEOUT}s"
	info "Check:"
	info "  1) fail2ban ignoreip does not whitelist $ATTACKER_IP"
	info "  2) Nginx sees the real IP (not 172.x gateway)"
	info "  3) docker logs $FAIL2BAN_CONTAINER --tail 50"
fi

# ── Step 4: iptables ────────────────────────────────────────────
step "4. Verifying iptables DOCKER-USER chain"
if iptables -C DOCKER-USER -s "$ATTACKER_IP" -j DROP 2>/dev/null; then
	ok "DROP rule for $ATTACKER_IP is present"
else
	warn "No exact DROP rule found for $ATTACKER_IP"
	info "Current DOCKER-USER chain:"
	iptables -L DOCKER-USER -n --line-numbers 2>/dev/null || true
fi

# ── Step 5: confirm ─────────────────────────────────────────────
step "5. Final confirmation"
info "On the attacker machine run:"
printf "\n    ${BOLD}./fail2ban_attacker.sh %s --test${RESET}\n\n" "$SERVER_IP"
info "Expected: connection times out (curl 000) → ban works end-to-end."
pause

# ── Optional demos ──────────────────────────────────────────────
if [ "$WITH_DEMOS" -eq 1 ]; then
	step "6. Manual socket demo"
	TEST_IP="192.168.99.99"
	printf "  ${ATTACK} BAN %s\n" "$TEST_IP"
	REPLY=$(docker exec "$FAIL2BAN_CONTAINER" sh -c \
		"echo 'BAN $TEST_IP' | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock" 2>/dev/null || echo FAILED)
	printf "  ${SHIELD} Reply: ${GREEN}%s${RESET}\n" "$REPLY"
	iptables -C DOCKER-USER -s "$TEST_IP" -j DROP 2>/dev/null && ok "rule present" || warn "rule not found"

	printf "\n  ${UNLOCK} UNBAN %s\n" "$TEST_IP"
	REPLY=$(docker exec "$FAIL2BAN_CONTAINER" sh -c \
		"echo 'UNBAN $TEST_IP' | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock" 2>/dev/null || echo FAILED)
	printf "  ${SHIELD} Reply: ${GREEN}%s${RESET}\n" "$REPLY"
	iptables -C DOCKER-USER -s "$TEST_IP" -j DROP 2>/dev/null && bad "still present" || ok "removed"

	step "7. Input validation demo"
	for payload in "BAN not_an_ip" "BAN 999.999.999.999" "BAN 1.2.3.4 ; rm -rf /" "DELETE 1.2.3.4"; do
		REPLY=$(docker exec "$FAIL2BAN_CONTAINER" sh -c \
			"echo '$payload' | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock" 2>/dev/null || echo FAILED)
		printf "  ${ATTACK} %-32s → ${RED}%s${RESET}\n" "$payload" "$REPLY"
	done
fi

# ── Summary ─────────────────────────────────────────────────────
printf "\n  ${SHIELD} ${BOLD}${MAGENTA}Done${RESET}\n"
if [ "$BANNED" -eq 1 ]; then
	ok "ban chain works end-to-end"
else
	warn "ban not observed — check nginx + fail2ban logs"
fi
info "To unban manually: make unban IP=$ATTACKER_IP"
printf "\n"

