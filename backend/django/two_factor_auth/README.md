### 2FA Implementation Plan

TOTP‑based two‑factor authentication (TOTP = Time‑based One‑Time Password) works by having the user scan a QR code with an authenticator app (like Google Authenticator, Authy, etc.). The app then generates a new 6‑digit code every 30 seconds. The server verifies that code against a shared secret. This adds a second layer of protection: even if someone steals the user's password, they cannot log in without the current code.

Security principles:

The TOTP secret is encrypted at rest using Fernet (AES‑128 + HMAC) with a key derived from Django's SECRET_KEY.

2FA enrollment requires a confirmed email and a valid access token.

After 2FA is enabled, login returns a temporary token instead of a JWT; the real tokens are only issued after successful TOTP verification.

Temporary tokens are single‑use, short‑lived (60 seconds), and stored in Redis.

Rate limiting prevents brute‑force attacks on the verification endpoint.

Recovery codes provide a fallback in case the user loses their authenticator device.


### 2FA Implementation Plan

1. **Model & utilities** — encrypted TOTP secret storage, key derivation, code generation/verification
2. **Enrollment** — enable 2FA (returns QR code URI) and confirm with first TOTP code
3. **Login flow modification** — return temporary 2FA token instead of JWT when 2FA is active
4. **Verification endpoint** — validate TOTP code + temp token, issue final JWT
5. **Frontend** — `verify2FA()` function, UI for TOTP code entry
6. **Recovery codes** — one‑time backup codes (stored as hashes)
7. **Rate limiting** — brute‑force protection on verification endpoint
8. **Disable 2FA** — requires password confirmation
