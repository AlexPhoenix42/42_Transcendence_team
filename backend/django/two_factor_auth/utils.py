# two_factor_auth/utils.py

from cryptography.fernet                        import Fernet
from cryptography.hazmat.primitives             import hashes
from cryptography.hazmat.primitives.kdf.hkdf    import HKDF

from django.conf                                import settings

import  base64
import  pyotp

import  secrets
#import  hashlib
#import  hmac

from django.contrib.auth.hashers import make_password, check_password

from .models import RecoveryCode

# ===========================================================================
def _get_fernet_key() -> bytes:
    # this is public, just prevents rainbow tables
    salt    = b'totp-static-salt' 

    hkdf    = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=b'totp-encryption',
    )

    return base64.urlsafe_b64encode(hkdf.derive(settings.SECRET_KEY.encode()))
# ===========================================================================


# ===========================================================================
def encrypt_secret(plain_secret: str) -> bytes:
    f = Fernet(_get_fernet_key())

    return f.encrypt(plain_secret.encode())

def decrypt_secret(encrypted_secret: bytes) -> str:
    f = Fernet(_get_fernet_key())
    return f.decrypt(encrypted_secret).decode()
# ===========================================================================


# ===========================================================================
def generate_totp_secret() -> str:
    return pyotp.random_base32()
# ===========================================================================


# ===========================================================================
def get_provisioning_uri(user, secret: str) -> str:
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(
        name=user.email,
        issuer_name="Transcendence",
    )
# ===========================================================================


# ===========================================================================
def verify_totp_code(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)
# ===========================================================================


# ==================================i=========================================
def generate_recovery_codes(device, cnt=8):
    """Generate `count` plain recovery codes, hash them, store them, and return the plain codes."""
    plain_codes = []

    for _ in range(cnt):
        # Genrate a random 4-byte hex string, split into two groups for redability
        raw     = secrets.token_hex(4).upper()
        code    = f"{raw[:4]}-{raw[4:8]}"

        plain_codes.append(code)

        # Hash the code and store it
        hashed = make_password(code)
        RecoveryCode.objects.create(device=device, hashed_code=hashed)

    return plain_codes
# ===========================================================================


# ===========================================================================
def verify_recovery_code(device, code) -> bool:
    """
    Check a provided recovery code against the device's stored hashes.
    if valid, delete the used hash and return True. Otherwise return False.
    """
    codes = RecoveryCode.objects.filter(device=device)
    for stored in codes:
        if  check_password(code, stored.hashed_code):
            stored.delete()
            return True

    return False
# ===========================================================================

