#!/usr/bin/env bash
# ============================================================================
# audit_mock.sh — Security Audit Log demonstration script
#
# Usage:   ./audit_mock.sh [BASE_URL]
#          DELAY=15 ./audit_mock.sh https://localhost:4443
#
# Example: ./audit_mock.sh https://<server-ip>:4443
#          ./audit_mock.sh https://localhost:4443
#
# Environment variable:
#   DELAY — seconds to wait between requests to avoid throttling (default: 13)
#           Your anon throttle is 5/minute, so 13s keeps you under the limit.
#
# Prerequisites:
#   - A test user account (not admin!) with known credentials
#   - An admin account to view logs and unlock
#   - The app running with the audit module enabled
#
# What it demonstrates:
#   1. Successful login (logged as login_success)
#   2. Failed login attempts (logged as login_failed)
#   3. Auto-lock after 5 failures (logged as account_locked)
#   4. Locked account rejected (403)
#   5. Admin views audit logs via API
#   6. Admin unlocks the account (logged as account_unlocked)
#   7. User can log in again
# ============================================================================

set -euo pipefail

BASE="${1:-https://localhost:4443}"
API="$BASE/api"

# ── timing ──
DELAY=${DELAY:-13}   # seconds between requests (adjust if throttled)

# ── colors ──
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

step=0
step() {
    step=$((step + 1))
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  Step $step: $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

pause() {
    echo ""
    echo -e "${YELLOW}  Press Enter to continue...${NC}"
    read -r
}

cooldown() {
    echo -e "  ${YELLOW}  Waiting ${DELAY}s (throttle cooldown)...${NC}"
    sleep "$DELAY"
}

# ── collect credentials ──
echo -e "${BOLD}Security Audit Log — Demonstration Script${NC}"
echo -e "  Throttle delay: ${DELAY}s between requests"
echo ""

read -rp "Test user username (NOT admin): " TEST_USER
read -rsp "Test user correct password: " TEST_PASS
echo ""
read -rp "Admin username: " ADMIN_USER
read -rsp "Admin password: " ADMIN_PASS
echo ""
echo ""

# curl flags: -s silent, -k allow self-signed certs
C="curl -sk"

# ============================================================================
step "Successful login — should create a login_success audit entry"
# ============================================================================

echo "  Logging in as '$TEST_USER' with correct password..."
RESP=$($C -X POST "$API/login/" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$TEST_USER\",\"password\":\"$TEST_PASS\"}")

if echo "$RESP" | grep -q "access"; then
    echo -e "  ${GREEN}✓ Login successful${NC}"
    echo "  Response: $(echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP")"
else
    echo -e "  ${RED}✗ Login failed — check credentials${NC}"
    echo "  Response: $RESP"
    exit 1
fi

pause

# ============================================================================
step "Failed login attempts (5x) — should trigger auto-lock"
# ============================================================================

for i in 1 2 3 4 5; do
    echo "  Attempt $i/5 — wrong password..."
    RESP=$($C -X POST "$API/login/" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$TEST_USER\",\"password\":\"wrong_password_$i\"}")

    STATUS=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('detail',''))" 2>/dev/null || echo "")
    echo -e "  ${RED}  ✗ Failed: $STATUS${NC}"

    if [ "$i" -lt 5 ]; then
        cooldown
    fi
done

echo ""
echo -e "  ${YELLOW}→ Account should now be locked after 5 failures${NC}"

pause
cooldown

# ============================================================================
step "Verify account is locked — correct password should be rejected"
# ============================================================================

echo "  Trying to log in with CORRECT password..."
RESP=$($C -X POST "$API/login/" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$TEST_USER\",\"password\":\"$TEST_PASS\"}")

if echo "$RESP" | grep -qi "locked"; then
    echo -e "  ${GREEN}✓ Account is locked — login rejected as expected${NC}"
else
    echo -e "  ${YELLOW}⚠ Unexpected response (may be throttled instead of locked)${NC}"
fi
echo "  Response: $(echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP")"

pause
cooldown

# ============================================================================
step "Admin login — get admin token to view audit logs"
# ============================================================================

echo "  Logging in as admin '$ADMIN_USER'..."
RESP=$($C -X POST "$API/login/" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

ADMIN_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access',''))" 2>/dev/null || echo "")

if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "None" ]; then
    echo -e "  ${GREEN}✓ Admin logged in${NC}"
else
    # might need 2FA
    if echo "$RESP" | grep -q "requires_2fa"; then
        echo -e "  ${YELLOW}Admin account requires 2FA${NC}"
        read -rp "  Enter 2FA code: " TOTP_CODE
        TEMP_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('temp_token',''))" 2>/dev/null || echo "")
        RESP=$($C -X POST "$API/auth/2fa/verify/" \
            -H "Content-Type: application/json" \
            -d "{\"temp_token\":\"$TEMP_TOKEN\",\"code\":\"$TOTP_CODE\"}")
        ADMIN_TOKEN=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access',''))" 2>/dev/null || echo "")
        if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "None" ]; then
            echo -e "  ${GREEN}✓ Admin logged in with 2FA${NC}"
        else
            echo -e "  ${RED}✗ Admin login failed${NC}"
            echo "  $RESP"
            exit 1
        fi
    else
        echo -e "  ${RED}✗ Admin login failed${NC}"
        echo "  $RESP"
        exit 1
    fi
fi

pause

# ============================================================================
step "View audit logs — admin sees all security events"
# ============================================================================

echo "  Fetching audit logs..."
RESP=$($C -X GET "$API/audit/logs/" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"

pause

# ============================================================================
step "Filter: show only failed logins for '$TEST_USER'"
# ============================================================================

RESP=$($C -X GET "$API/audit/logs/?event_type=login_failed&username=$TEST_USER" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"

pause

# ============================================================================
step "View suspicious activity summary (last 24h)"
# ============================================================================

RESP=$($C -X GET "$API/audit/suspicious/" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"

pause

# ============================================================================
step "Admin unlocks the account"
# ============================================================================

echo "  Unlocking '$TEST_USER'..."
RESP=$($C -X POST "$API/audit/unlock/" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$TEST_USER\"}")

echo -e "  ${GREEN}$(echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP")${NC}"

pause
cooldown

# ============================================================================
step "Verify user can log in again after unlock"
# ============================================================================

echo "  Logging in as '$TEST_USER' with correct password..."
RESP=$($C -X POST "$API/login/" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$TEST_USER\",\"password\":\"$TEST_PASS\"}")

if echo "$RESP" | grep -q "access"; then
    echo -e "  ${GREEN}✓ Login successful — account is unlocked!${NC}"
else
    echo -e "  ${RED}✗ Still locked or login failed${NC}"
    echo "  $RESP"
fi

pause

# ============================================================================
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✓ Demonstration complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Summary of events created:"
echo "    • login_success    (step 1 + step 9)"
echo "    • login_failed x5  (step 2)"
echo "    • account_locked   (step 2, auto)"
echo "    • account_unlocked (step 8, admin)"
echo ""
echo "  You can also view these in the Admin Dashboard → Security Audit tab"
echo ""

