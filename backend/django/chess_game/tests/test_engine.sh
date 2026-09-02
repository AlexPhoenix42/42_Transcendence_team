#!/usr/bin/env bash
#!/bin/bash
# test_engine_edge_cases.sh
# Run from the repo root. Requires the stack to be up.

ENGINE_URL="http://chess_engine:4190/validate"
CURL="docker compose exec -T backend_django curl -s -X POST $ENGINE_URL -H Content-Type: application/json"

fail() { echo "FAIL: $1"; FAILURES=$((FAILURES+1)); }
pass() { echo "PASS: $1"; }
check() {
    local desc="$1" data="$2" expected="$3"
    local resp
    resp=$($CURL -d "$data" 2>/dev/null)
    if echo "$resp" | grep -q "$expected"; then
        pass "$desc"
    else
        fail "$desc (expected '$expected', got '$resp')"
    fi
}

FAILURES=0

echo "=== Edge-case tests for chess engine ==="
echo ""

# 1. Kingside castling (f1,g1 empty)
check "White kingside castling" \
    '{"fen":"r1bqkb1r/pppppppp/2n2n2/8/4P3/2N5/PPPP1PPP/R1BQK2R w KQkq - 4 4","move":"e1g1"}' \
    '"legal":true'

# 2. Queenside castling
check "White queenside castling" \
    '{"fen":"r3kb1r/pppppppp/8/8/8/8/PPPPPPPP/R3KB1R w KQkq - 0 1","move":"e1c1"}' \
    '"legal":true'

# 3. En passant capture
check "Black en passant capture" \
    '{"fen":"rnbqkbnr/ppppp1pp/8/8/3pP3/8/PPP2PPP/RNBQKBNR b KQkq e3 0 2","move":"d4e3"}' \
    '"legal":true'

# 4. En passant not available
check "En passant not available" \
    '{"fen":"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1","move":"d7e3"}' \
    '"legal":false'

# 5. Pawn promotion (with piece)
check "White pawn promotion to queen" \
    '{"fen":"rnbqkb1r/ppppppPp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 4","move":"g7g8q"}' \
    '"legal":true'

# 6. Pawn promotion without piece – illegal
check "Promotion without piece – illegal" \
    '{"fen":"rnbqkb1r/ppppppPp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 4","move":"g7g8"}' \
    '"legal":false'

# 7. Stalemate
check "Stalemate (no legal moves, not in check)" \
    '{"fen":"7k/5Q2/6K1/8/8/8/8/8 b - - 0 1","move":"h8g8"}' \
    '"legal":false'

# 8. King vs King (legal move)
check "King vs King (legal move)" \
    '{"fen":"8/8/8/4k3/8/8/3K4/8 w - - 0 1","move":"d2e3"}' \
    '"legal":true'

# 9. Invalid FEN (garbage) – now returns 400
check "Invalid FEN (garbage)" \
    '{"fen":"garbage","move":"e2e4"}' \
    '"error":"invalid_fen"'

# 10. Invalid move format (too short)
check "Invalid move format (too short)" \
    '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","move":"e2"}' \
    '"error":"invalid_move_format"'

# 11. Move piece of wrong color
check "Move piece of wrong color" \
    '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","move":"e7e5"}' \
    '"legal":false'

echo ""
echo "=== Results: $FAILURES failures ==="
exit $FAILURES

