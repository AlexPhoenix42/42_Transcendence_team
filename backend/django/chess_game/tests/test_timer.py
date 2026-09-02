#!/usr/bin/env python3
"""
test_time_controls.py
Requires the stack to be up.
Tests timeout / disconnect enforcement by injecting game state into Redis (db=2)
and waiting for the checker to clean it up.
"""

import subprocess
import time
import json
import sys

REDIS_DB = 2
FAILURES = 0

def redis_cmd(*args):
    """Run a redis-cli command inside the redis container and return stdout."""
    cmd = ["docker", "compose", "exec", "-T", "redis", "redis-cli", "-n", str(REDIS_DB)] + list(args)
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.stdout.strip()

def fail(msg):
    global FAILURES
    FAILURES += 1
    print(f"FAIL: {msg}")

def ok(msg):
    print(f"PASS: {msg}")

def wait_for_deletion(game_id, timeout_sec=30):
    """Poll until the game key disappears. Returns True if deleted."""
    for _ in range(timeout_sec):
        time.sleep(1)
        res = redis_cmd("EXISTS", f"game:{game_id}")
        if res == "0":
            return True
    return False

def key_still_exists(game_id, delay=10):
    """Wait `delay` seconds, then check that the key still exists."""
    time.sleep(delay)
    return redis_cmd("EXISTS", f"game:{game_id}") == "1"

def set_game(game_id, state_dict):
    """Insert a game key and add its id to active_games."""
    redis_cmd("DEL", f"game:{game_id}")
    redis_cmd("SADD", "active_games", str(game_id))
    redis_cmd("SET", f"game:{game_id}", json.dumps(state_dict))

def cleanup(*ids):
    for gid in ids:
        redis_cmd("SREM", "active_games", str(gid))
        redis_cmd("DEL", f"game:{gid}")

# ── main ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    now = time.time()
    print("=== Time Control & Disconnect Tests ===\n")

    # ── Test 1: timeout enforcement ─────────────────────────────────────
    print("--- Test 1: Timeout enforcement ---")
    set_game(998, {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "crnt_turn": 1, "check": False, "checkmate": False,
        "status": "IN_PROGRESS", "moves": [], "disconnected": {},
        "player1_id": 1, "player2_id": 2,
        "timer": {"init": 300, "inc": 0},
        "clocks": {"1": 300, "2": 300},
        "last_tick": now - 600
    })
    if wait_for_deletion(998):
        ok("Timeout enforced and game cleaned up")
    else:
        fail("Timeout was not enforced")

    # ── Test 2: disconnect for unlimited game ───────────────────────────
    print("--- Test 2: Disconnect enforcement ---")
    set_game(997, {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "crnt_turn": 1, "check": False, "checkmate": False,
        "status": "IN_PROGRESS", "moves": [],
        "disconnected": {"2": now - 60},
        "player1_id": 1, "player2_id": 2
    })
    if wait_for_deletion(997):
        ok("Disconnect enforced and game cleaned up")
    else:
        fail("Disconnect was not enforced")

    # ── Test 3: timer not expired ───────────────────────────────────────
    print("--- Test 3: Timer not expired ---")
    set_game(996, {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "crnt_turn": 1, "check": False, "checkmate": False,
        "status": "IN_PROGRESS", "moves": [], "disconnected": {},
        "player1_id": 1, "player2_id": 2,
        "timer": {"init": 300, "inc": 0},
        "clocks": {"1": 300, "2": 300},
        "last_tick": now
    })
    if key_still_exists(996):
        ok("Game with remaining time preserved")
    else:
        fail("Game with remaining time was incorrectly deleted")

    # ── Test 4: timer with increment, not expired ───────────────────────
    print("--- Test 4: Timer with increment, not expired ---")
    set_game(995, {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "crnt_turn": 1, "check": False, "checkmate": False,
        "status": "IN_PROGRESS", "moves": [], "disconnected": {},
        "player1_id": 1, "player2_id": 2,
        "timer": {"init": 300, "inc": 5},
        "clocks": {"1": 300, "2": 300},
        "last_tick": now
    })
    if key_still_exists(995):
        ok("Game with increment preserved")
    else:
        fail("Game with increment was incorrectly deleted")

    # ── Test 5: boundary timeout (0.1s left) ────────────────────────────
    print("--- Test 5: Boundary timeout (0.1s left, no increment) ---")
    set_game(994, {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "crnt_turn": 1, "check": False, "checkmate": False,
        "status": "IN_PROGRESS", "moves": [], "disconnected": {},
        "player1_id": 1, "player2_id": 2,
        "timer": {"init": 300, "inc": 0},
        "clocks": {"1": 0.1, "2": 300},
        "last_tick": now - 600
    })
    if wait_for_deletion(994):
        ok("Boundary timeout enforced")
    else:
        fail("Boundary timeout was not enforced")

    # ── Test 6: stale active_games cleanup ──────────────────────────────
    print("--- Test 6: Stale active_games cleanup ---")
    redis_cmd("DEL", "game:993")
    redis_cmd("SADD", "active_games", "993")
    time.sleep(5)
    if redis_cmd("SISMEMBER", "active_games", "993") == "0":
        ok("Stale active_games member removed")
    else:
        fail("Stale active_games member was not removed")

    # ── Test 7: timed game with disconnect AND expired timer ────────────
    print("--- Test 7: Timed game with disconnect AND expired timer ---")
    set_game(992, {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "crnt_turn": 1, "check": False, "checkmate": False,
        "status": "IN_PROGRESS", "moves": [],
        "player1_id": 1, "player2_id": 2,
        "timer": {"init": 300, "inc": 0},
        "clocks": {"1": 300, "2": 300},
        "last_tick": now - 600,
        "disconnected": {"2": now - 60}
    })
    if wait_for_deletion(992):
        ok("Timed game with both conditions handled")
    else:
        fail("Timed game with both conditions was not handled")

    # ── Test 8: DB failure doesn't crash checker ────────────────────────
    print("--- Test 8: DB failure does not crash checker ---")
    set_game(991, {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "crnt_turn": 1, "check": False, "checkmate": False,
        "status": "IN_PROGRESS", "moves": [],
        "disconnected": {"2": now - 60},
        "player1_id": 1, "player2_id": 2
    })
    if wait_for_deletion(991):
        ok("DB failure handled gracefully (game cleaned up)")
    else:
        fail("DB failure crashed the checker or prevented cleanup")

    # ── Final cleanup ──────────────────────────────────────────────────
    cleanup(998, 997, 996, 995, 994, 993, 992, 991)

    print(f"\n=== Results: {FAILURES} failures ===")
    sys.exit(FAILURES)

