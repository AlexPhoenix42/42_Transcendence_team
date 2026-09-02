#!/usr/bin/env python
"""One‑shot 2FA confirmation script.

Usage (run inside the container):
    docker exec trans_backend_django python /django/two_factor_auth/2fa_test.py USERNAME PASSWORD
"""

import sys
import os
import json
import urllib.request
import urllib.error

# Make sure the project root is on sys.path so that 'config' can be found
PROJECT_ROOT = "/django"
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from two_factor_auth.utils import decrypt_secret
from two_factor_auth.models import TOTPDevice
import pyotp

# ------------------------------------------------
# Parse arguments
# ------------------------------------------------
if len(sys.argv) != 3:
    print("Usage: python 2fa_test.py USERNAME PASSWORD")
    sys.exit(1)

username = sys.argv[1]
password = sys.argv[2]

BASE_URL = os.environ.get("BASE_URL", "http://localhost:9000")

# ------------------------------------------------
# Login to get an access token
# ------------------------------------------------
try:
    req = urllib.request.Request(
        f"{BASE_URL}/api/login/",
        data=json.dumps({"username": username, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        data = json.load(resp)
    access_token = data.get("access")
    if not access_token:
        print("Login failed – no access token in response:", data)
        sys.exit(1)
    print("✅ Logged in successfully.")
except urllib.error.HTTPError as e:
    print(f"❌ Login failed ({e.code}): {e.read().decode()}")
    sys.exit(1)

# ------------------------------------------------
# Retrieve the pending TOTP device
# ------------------------------------------------
try:
    device = TOTPDevice.objects.get(user__username=username, is_active=False)
    plain_secret = decrypt_secret(device.encrypted_secret)
    print("✅ Pending device found and secret decrypted.")
except TOTPDevice.DoesNotExist:
    print("❌ No pending (inactive) TOTP device found for this user.")
    sys.exit(1)

# ------------------------------------------------
# Generate the current TOTP code (inside container = perfect clock sync)
# ------------------------------------------------
totp = pyotp.TOTP(plain_secret)
code = totp.now()
print(f"🔑 Generated code: {code}")

# ------------------------------------------------
# Confirm 2FA
# ------------------------------------------------
try:
    req = urllib.request.Request(
        f"{BASE_URL}/api/auth/2fa/confirm-enable/",
        data=json.dumps({"code": code}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
        },
    )
    with urllib.request.urlopen(req) as resp:
        result = json.load(resp)
    print("📬 Confirm response:", result)
except urllib.error.HTTPError as e:
    print(f"❌ Confirm failed ({e.code}): {e.read().decode()}")
    sys.exit(1)

