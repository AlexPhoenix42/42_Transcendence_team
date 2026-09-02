
---

Plan forward

1- Add Mailpit to Docker – capture emails for development.

2- Model changes – add email_verified field to User, create EmailVerificationToken model.

3- On registration – generate a token, store its hash, send the verification link via email (captured by Mailpit).

4- Verification endpoint – validate the token, set email_verified=True, delete the token.

5- Login checks – implement the lazy freeze logic (if unverified and now > date_joined + 3 days → freeze).

6- Resend endpoint – rate‑limited, sends a new token.

We’ll tackle these one piece at a time, starting with Mailpit.

---

