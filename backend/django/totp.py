#!/usr/bin/env python3
"""
Standalone TOTP code generator (zero dependencies).
Usage: python3 totp.py <SECRET>
       or pipe: echo <SECRET> | python3 totp.py
"""

import sys
import hmac
import time
import base64
import struct
import hashlib

DIGITS = 6
PERIOD = 30

def generate_totp(secret: str, period: int = PERIOD, digits: int = DIGITS) -> tuple[int, int]:
    # 1. Decode the Base32 secret
    key = base64.b32decode(secret.upper(), casefold=True)

    # 2. Current 30‑second time step
    counter = int(time.time() // period)

    # 3. HMAC‑SHA1 the counter
    counter_bytes = struct.pack(">Q", counter)
    h = hmac.new(key, counter_bytes, hashlib.sha1).digest()

    # 4. Dynamic truncation (RFC 4226)
    offset = h[-1] & 0x0F
    binary = (h[offset] & 0x7F) << 24 | (h[offset+1] & 0xFF) << 16 | (h[offset+2] & 0xFF) << 8 | (h[offset+3] & 0xFF)

    # 5. Reduce to 6 digits
    otp = binary % (10 ** digits)
    remaining = period - (int(time.time()) % period)
    return otp, remaining

if __name__ == "__main__":
    if len(sys.argv) > 1:
        secret = sys.argv[1].strip()
    else:
        secret = sys.stdin.read().strip()

    if not secret:
        print("Usage: python3 totp.py <SECRET>")
        sys.exit(1)

    code, remaining = generate_totp(secret)
    print(f"{code:0{DIGITS}}  (next code in {remaining}s)")

