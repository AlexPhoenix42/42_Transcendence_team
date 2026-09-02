#!/usr/bin/env python
"""
Test the 2FA verification flow.

Usage (run inside the container):
    docker exec trans_backend_django python /django/test_2fa_verify.py USERNAME PASSWORD
"""

import sys
import os
import json
import urllib.request
import urllib.error

# ----------------------------------------------------------------------
# 1. Setup Django environment (so we can query the database)
# ----------------------------------------------------------------------
PROJECT_ROOT = "/django"
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from two_factor_auth.utils import decrypt_secret
from two_factor_auth.models import TOTPDevice
import pyotp

# ----------------------------------------------------------------------
# 2. Parse arguments
# ----------------------------------------------------------------------
if len(sys.argv) != 3:
    print("Usage: python test_2fa_verify.py USERNAME PASSWORD")
    sys.exit(1)

username = sys.argv[1]
password = sys.argv[2]

BASE_URL = os.environ.get("BASE_URL", "http://localhost:9000")

# ----------------------------------------------------------------------
# 3. Login to get a tmp_token
# ----------------------------------------------------------------------
try:
    req = urllib.request.Request(
        f"{BASE_URL}/api/login/",
        data=json.dumps({"username": username, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        data = json.load(resp)
except urllib.error.HTTPError as e:
    print(f"❌ Login failed ({e.code}): {e.read().decode()}")
    sys.exit(1)

tmp_token = data.get("tmp_token")
if not tmp_token:
    # User probably does not have 2FA enabled – normal JWT response
    print("ℹ️  No tmp_token returned. User may not have 2FA enabled.")
    print("Response:", json.dumps(data, indent=2))
    sys.exit(0)

print("✅ Got tmp_token:", tmp_token)

# ----------------------------------------------------------------------
# 4. Retrieve the TOTP secret from the database
# ----------------------------------------------------------------------
try:
    device = TOTPDevice.objects.get(user__username=username, is_active=True)
    plain_secret = decrypt_secret(device.encrypted_secret)
    print("✅ Active TOTP device found and secret decrypted.")
except TOTPDevice.DoesNotExist:
    print("❌ No active TOTP device found for this user.")
    sys.exit(1)

# ----------------------------------------------------------------------
# 5. Generate the current TOTP code (inside container = same clock)
# ----------------------------------------------------------------------
totp = pyotp.TOTP(plain_secret)
code = totp.now()
print(f"🔑 Generated TOTP code: {code}")

# ----------------------------------------------------------------------
# 6. Call the verify endpoint
# ----------------------------------------------------------------------
try:
    req = urllib.request.Request(
        f"{BASE_URL}/api/auth/2fa/verify/",
        data=json.dumps({"tmp_token": tmp_token, "code": code}).encode(),
        headers={
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        result = json.load(resp)
    print("📬 Verify response:", json.dumps(result, indent=2))
    if "access" in result:
        print("\n✅ 2FA verification succeeded. Access token:")
        print(result["access"])
except urllib.error.HTTPError as e:
    print(f"❌ Verify failed ({e.code}): {e.read().decode()}")
    sys.exit(1)

