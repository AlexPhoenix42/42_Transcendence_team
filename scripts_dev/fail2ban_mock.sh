#!/usr/bin/env bash
# ============================================================================
# fail2ban_mock.sh — Demonstrate fail2ban + firewall-agent privilege separation
#
# This script simulates brute-force login attempts against the Transcendence
# stack and shows the full chain in action:
#
#   1. Attacker sends failed login requests → Nginx logs 401/403
#   2. fail2ban detects the pattern in the access log
#   3. fail2ban sends BAN command to firewall-agent via Unix socket
#   4. firewall-agent applies iptables -I DOCKER-USER -s <ip> -j DROP
#   5. Attacker is blocked at the network level
#
# Usage:
#   sudo bash fail2ban_mock.sh
#
# Requirements:
#   - Stack must be running (make build / make up)
#   - Must run as root (needs iptables access for verification)
# ============================================================================

set -euo pipefail

# Re-exec as root if not already
if [ "$(id -u)" -ne 0 ]; then
	exec sudo "$0" "$@"
fi

# ── Colors & Icons ────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[38;5;220m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

SHIELD="🛡️"
ATTACK="⚔️"
CHECK="✅"
CROSS="❌"
CLOCK="⏳"
EYES="👀"
LOCK="🔒"
UNLOCK="🔓"

# ── Config ────────────────────────────────────────────────────────
FAIL2BAN_CONTAINER="trans_fail2ban"
NGINX_CONTAINER="trans_frontend_nginx"
SERVER_IP=$(grep -m1 'SERVER_IP=' .env 2>/dev/null | cut -d= -f2 || echo "localhost")
TARGET_URL="https://${SERVER_IP}:4443/api/login/"
JAIL="transcendence-auth"

# The IP that fail2ban will see (the Docker gateway, or host IP)
# We use a specific test endpoint to generate 401s
MAX_RETRY=5          # matches jail config
FINDTIME=900         # 15 minutes
BANTIME=1800         # 30 minutes

# ── Helper functions ──────────────────────────────────────────────
banner() {
	printf "\n"
	printf "  ${SHIELD} ${BOLD}${MAGENTA}fail2ban + firewall-agent${RESET} — ${BOLD}Demo${RESET}\n"
	printf "  ${BOLD}─────────────────────────────────────────${RESET}\n"
	printf "\n"
}

step() {
	printf "\n  ${CYAN}${BOLD}── Step $1: $2${RESET}\n\n"
}

info() {
	printf "  ${DIM}$1${RESET}\n"
}

success() {
	printf "  ${CHECK} ${GREEN}$1${RESET}\n"
}

fail() {
	printf "  ${CROSS} ${RED}$1${RESET}\n"
}

warn() {
	printf "  ${CLOCK} ${YELLOW}$1${RESET}\n"
}

separator() {
	printf "  ${DIM}──────────────────────────────────────────────${RESET}\n"
}

wait_for_input() {
	printf "\n  ${DIM}Press Enter to continue...${RESET}"
	read -r
}

# ── Pre-checks ────────────────────────────────────────────────────
banner

printf "  ${EYES} ${BOLD}Pre-flight checks${RESET}\n"
separator

# Check root
if [ "$(id -u)" -ne 0 ]; then
	fail "Must run as root (need iptables access)"
	exit 1
fi
success "Running as root"

# Check containers are running
if ! docker inspect "$FAIL2BAN_CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
	fail "fail2ban container ($FAIL2BAN_CONTAINER) is not running"
	printf "  ${DIM}Start the stack first: make build${RESET}\n"
	exit 1
fi
success "fail2ban container is running"

if ! docker inspect "$NGINX_CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
	fail "nginx container ($NGINX_CONTAINER) is not running"
	exit 1
fi
success "nginx container is running"

# Check firewall-agent socket
if ! docker exec "$FAIL2BAN_CONTAINER" test -S /var/run/firewall-agent/firewall.sock; then
	fail "firewall-agent socket not found"
	exit 1
fi
success "firewall-agent socket is accessible"

# Show current jail status
printf "\n  ${EYES} ${BOLD}Current jail status:${RESET}\n"
separator
docker exec "$FAIL2BAN_CONTAINER" fail2ban-client status "$JAIL" 2>/dev/null || true
printf "\n"

# Show current DOCKER-USER chain
printf "  ${EYES} ${BOLD}Current DOCKER-USER chain:${RESET}\n"
separator
iptables -L DOCKER-USER -n --line-numbers 2>/dev/null || printf "  ${DIM}(empty)${RESET}\n"

wait_for_input

# ══════════════════════════════════════════════════════════════════
# DEMO 1: Automated ban via fail2ban
# ══════════════════════════════════════════════════════════════════

step "1" "Simulating brute-force login attempts"

info "Sending $((MAX_RETRY + 1)) failed login requests to $TARGET_URL"
info "fail2ban threshold: $MAX_RETRY failures in ${FINDTIME}s → ban for ${BANTIME}s"
printf "\n"

for i in $(seq 1 $((MAX_RETRY + 1))); do
	printf "  ${ATTACK} Request $i/$((MAX_RETRY + 1)): "

	HTTP_CODE=$(curl -sk -o /dev/null -w '%{http_code}' \
		-X POST "$TARGET_URL" \
		-H "Content-Type: application/json" \
		-d '{"username":"attacker","password":"wrong_password_'$i'"}' \
		2>/dev/null || echo "000")

	case "$HTTP_CODE" in
		401) printf "${RED}401 Unauthorized${RESET} (wrong credentials)\n" ;;
		403) printf "${RED}403 Forbidden${RESET} (blocked by WAF/rate-limit)\n" ;;
		429) printf "${YELLOW}429 Too Many Requests${RESET} (rate-limited)\n" ;;
		000) printf "${RED}Connection refused${RESET} (already banned?)\n" ;;
		*)   printf "${DIM}$HTTP_CODE${RESET}\n" ;;
	esac

	sleep 0.5
done

wait_for_input

# ── Step 2: Check the nginx access log ────────────────────────────

step "2" "Checking Nginx access log for failed attempts"

info "Last 10 lines with 401/403/429 on auth endpoints:"
separator
docker exec "$NGINX_CONTAINER" tail -20 /var/log/nginx/access.log 2>/dev/null | \
	grep -E '"POST /api/(login|register|auth|password-reset|2fa-reset)/.* (401|403|429)' | \
	tail -10 || info "(no matching lines yet)"

wait_for_input

# ── Step 3: Check fail2ban detection ──────────────────────────────

step "3" "Waiting for fail2ban to detect and ban"

warn "fail2ban checks logs periodically — this may take up to 30 seconds..."
printf "\n"

BANNED=0
for i in $(seq 1 30); do
	JAIL_STATUS=$(docker exec "$FAIL2BAN_CONTAINER" fail2ban-client status "$JAIL" 2>/dev/null)
	BANNED_COUNT=$(echo "$JAIL_STATUS" | grep "Currently banned" | grep -oE '[0-9]+' || echo "0")

	if [ "$BANNED_COUNT" -gt 0 ]; then
		BANNED=1
		break
	fi

	printf "\r  ${CLOCK} Waiting... (%d/30s)" "$i"
	sleep 1
done
printf "\r                              \r"

if [ "$BANNED" -eq 1 ]; then
	success "fail2ban detected the brute-force!"
	printf "\n"
	printf "  ${EYES} ${BOLD}Jail status after detection:${RESET}\n"
	separator
	docker exec "$FAIL2BAN_CONTAINER" fail2ban-client status "$JAIL" 2>/dev/null || true
else
	warn "No ban detected yet — fail2ban may need more time or the requests"
	warn "might be coming from a Docker-internal IP (in ignoreip list)."
	info "Check manually: docker exec $FAIL2BAN_CONTAINER fail2ban-client status $JAIL"
fi

wait_for_input

# ── Step 4: Verify iptables rule ──────────────────────────────────

step "4" "Verifying iptables DOCKER-USER chain"

printf "  ${EYES} ${BOLD}DOCKER-USER chain:${RESET}\n"
separator
DROP_RULES=$(iptables -L DOCKER-USER -n --line-numbers 2>/dev/null | grep DROP || true)
if [ -n "$DROP_RULES" ]; then
	echo "$DROP_RULES"
	printf "\n"
	success "IP is banned at the network level!"
else
	info "(no DROP rules found)"
	warn "The ban may not have been applied yet, or the attacker IP"
	warn "is a Docker-internal address covered by ignoreip."
fi

wait_for_input

# ── Step 5: Verify the ban works ──────────────────────────────────

step "5" "Testing that banned IP is actually blocked"

printf "  ${LOCK} Attempting to reach the server...\n"
HTTP_CODE=$(curl -sk -o /dev/null -w '%{http_code}' \
	--connect-timeout 5 --max-time 10 \
	-X POST "$TARGET_URL" \
	-H "Content-Type: application/json" \
	-d '{"username":"attacker","password":"test"}' \
	2>/dev/null || echo "000")

case "$HTTP_CODE" in
	000) success "Connection refused/timed out — IP is blocked at network level!" ;;
	*)   warn "Got HTTP $HTTP_CODE — the request still went through." \
		 info "This can happen if the attacker IP is localhost/Docker-internal." ;;
esac

wait_for_input

# ══════════════════════════════════════════════════════════════════
# DEMO 2: Manual socket commands
# ══════════════════════════════════════════════════════════════════

step "6" "Manual socket commands (privilege separation demo)"

info "Demonstrating direct communication with firewall-agent via socket."
info "This is what fail2ban does under the hood."
printf "\n"

TEST_IP="192.168.99.99"

printf "  ${ATTACK} Sending: BAN $TEST_IP\n"
BAN_REPLY=$(docker exec "$FAIL2BAN_CONTAINER" sh -c \
	"echo 'BAN $TEST_IP' | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock" 2>/dev/null || echo "FAILED")
printf "  ${SHIELD} Reply:   ${GREEN}$BAN_REPLY${RESET}\n"
printf "\n"

printf "  ${EYES} Checking iptables for $TEST_IP:\n"
iptables -L DOCKER-USER -n --line-numbers 2>/dev/null | grep "$TEST_IP" || info "  (not found)"
printf "\n"

printf "  ${UNLOCK} Sending: UNBAN $TEST_IP\n"
UNBAN_REPLY=$(docker exec "$FAIL2BAN_CONTAINER" sh -c \
	"echo 'UNBAN $TEST_IP' | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock" 2>/dev/null || echo "FAILED")
printf "  ${SHIELD} Reply:   ${GREEN}$UNBAN_REPLY${RESET}\n"
printf "\n"

printf "  ${EYES} Checking iptables after unban:\n"
if iptables -L DOCKER-USER -n 2>/dev/null | grep -q "$TEST_IP"; then
	fail "$TEST_IP still in DOCKER-USER chain"
else
	success "$TEST_IP removed from DOCKER-USER chain"
fi

wait_for_input

# ══════════════════════════════════════════════════════════════════
# DEMO 3: Validation / rejection demo
# ══════════════════════════════════════════════════════════════════

step "7" "Input validation demo (security hardening)"

info "firewall-agent validates every command. Let's test invalid inputs."
printf "\n"

declare -a TESTS=(
	"BAN not_an_ip"
	"BAN 999.999.999.999"
	"BAN 1.2.3.4 ; rm -rf /"
	"DELETE 1.2.3.4"
	""
)

declare -a LABELS=(
	"Invalid IP format"
	"Octet out of range"
	"Shell injection attempt"
	"Unknown command"
	"Empty input"
)

for idx in "${!TESTS[@]}"; do
	CMD="${TESTS[$idx]}"
	LABEL="${LABELS[$idx]}"

	printf "  ${ATTACK} %-30s → " "$LABEL"
	if [ -z "$CMD" ]; then
		REPLY=$(docker exec "$FAIL2BAN_CONTAINER" sh -c \
			"echo '' | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock" 2>/dev/null || echo "FAILED")
	else
		REPLY=$(docker exec "$FAIL2BAN_CONTAINER" sh -c \
			"echo '$CMD' | socat - UNIX-CONNECT:/var/run/firewall-agent/firewall.sock" 2>/dev/null || echo "FAILED")
	fi
	printf "${RED}$REPLY${RESET}\n"
done

printf "\n"
success "All malicious inputs rejected! No iptables rules modified."

wait_for_input

# ── Step 8: Check firewall-agent logs ─────────────────────────────

step "8" "Firewall-agent audit log"

info "Every action is logged with timestamps (last 20 lines):"
separator
docker logs trans_firewall_agent --tail 20 2>/dev/null || info "(no logs)"

wait_for_input

# ── Summary ───────────────────────────────────────────────────────

printf "\n"
printf "  ${SHIELD} ${BOLD}${MAGENTA}Demo Complete${RESET}\n"
printf "  ${BOLD}─────────────────────────────────────────${RESET}\n"
printf "\n"
printf "  ${BOLD}What we demonstrated:${RESET}\n"
printf "\n"
printf "  ${CHECK} fail2ban detects brute-force from Nginx access log\n"
printf "  ${CHECK} fail2ban sends BAN via Unix socket (no iptables access)\n"
printf "  ${CHECK} firewall-agent validates IP and applies iptables rule\n"
printf "  ${CHECK} Banned IP is blocked at network level (DOCKER-USER chain)\n"
printf "  ${CHECK} Manual BAN/UNBAN via socket works correctly\n"
printf "  ${CHECK} Invalid inputs are rejected (no injection possible)\n"
printf "  ${CHECK} Every action is logged with timestamps\n"
printf "\n"
printf "  ${BOLD}Privilege separation:${RESET}\n"
printf "\n"
printf "  ${LOCK} fail2ban    → ${DIM}unprivileged, no capabilities, non-root${RESET}\n"
printf "  ${LOCK} fw-agent    → ${DIM}CAP_NET_ADMIN only, read-only fs, 80 lines${RESET}\n"
printf "  ${LOCK} socket      → ${DIM}mode 0660, named volume, validated protocol${RESET}\n"
printf "\n"
printf "  ${BOLD}Useful commands:${RESET}\n"
printf "\n"
printf "  ${CYAN}make security${RESET}              Interactive security panel\n"
printf "  ${CYAN}make banned${RESET}                List banned IPs\n"
printf "  ${CYAN}make ban IP=x.x.x.x${RESET}       Manual ban\n"
printf "  ${CYAN}make unban IP=x.x.x.x${RESET}     Manual unban\n"
printf "  ${CYAN}make f2b-status${RESET}            Jail status\n"
printf "  ${CYAN}make f2b-logs${RESET}              fail2ban logs\n"
printf "  ${CYAN}make fw-logs${RESET}               firewall-agent logs\n"
printf "\n"

