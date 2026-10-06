
---

# Developer Guide: Setting Up Vault for Transcendence Stack

This guide explains how to set up the Vault service for the Transcendence project, from scratch, using the production‑grade configuration (TLS + Raft storage + AppRole authentication).  
It covers generating certificates, configuring the environment, and running the full stack.

---

## Prerequisites

- **Docker** and **Docker Compose** (latest stable)
- **OpenSSL** (for certificate generation)
- **jq** (for JSON parsing)
- **Bash** (for running scripts)
- **sudo** privileges (to set correct file ownership for the Vault container)

---

## Overview

The stack uses Vault to store secrets (Django `SECRET_KEY`, database credentials, OAuth client secrets).  
Secrets are seeded into Vault **automatically** on every `docker compose up` via the `vault-init` service and the `seed_vault.sh` script.

Vault runs in **production mode**:
- TLS encryption with self‑signed certificates
- Persistent storage using Raft (data survives container restarts)
- AppRole authentication (Django uses a role ID and secret ID to authenticate)

---

## Step 1: Clone the repository

```bash
git clone git@github.com:your-org/trans-fork.git
cd trans-fork
```

---

## Step 2: Generate TLS certificates

The stack requires a CA certificate and a server certificate for Vault.  
A helper script (`scripts_dev/gen_vault_cert.sh`) generates them with the correct extensions and permissions.

```bash
cd scripts_dev
sudo ./gen_vault_cert.sh
cd ..
```

**What this does:**
- Creates `vault/certs/` with `ca-cert.pem`, `vault-cert.pem`, `vault-key.pem`.
- Sets ownership to UID 100 (the `vault` user inside the container).
- Sets private keys to `600`, public certs to `644`.
- Marks `basicConstraints` as critical (required for Python/TLS).

**Note:** `sudo` is needed to change ownership to UID 100.  
If you cannot use `sudo`, the script will fall back to `644` permissions – but then the key will be world‑readable. This is acceptable for development, but **not** for production.

---

## Step 3: Configure environment variables

Copy the example environment file and edit it:

```bash
cp .env.example .env
vim .env
```

**Required variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `VAULT_URL` | Vault address (use HTTPS) | `https://vault:8200` |
| `VAULT_AUTH_METHOD` | Authentication method | `approle` |
| `VAULT_ROLE_ID` | AppRole role ID (see Step 5) | `6ca26bfd-...` |
| `VAULT_SECRET_ID` | AppRole secret ID (see Step 5) | `f744556c-...` |
| `VAULT_CACERT` | Path to CA certificate **inside containers** | `/vault/certs/ca-cert.pem` |
| `SECRET_KEY` | Django secret key | (generate one) |
| `DB_SERVER_USER`, `DB_SERVER_PASS`, `DB_SERVER_DB` | PostgreSQL credentials | as needed |
| `FT_CLIENT_ID`, `FT_CLIENT_SECRET` | OAuth credentials for 42 | as needed |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth credentials for Google | as needed |

> **Note:** The `VAULT_ROLE_ID` and `VAULT_SECRET_ID` are **placeholders** until you run the AppRole setup script (Step 5).  
> For now, you can leave them as is – the stack will work if you use **token auth** by switching `VAULT_AUTH_METHOD=token` and `VAULT_TOKEN=root`.  
> But for production, you **must** set up AppRole.

---

## Step 4: Start the stack

```bash
docker compose -f docker-compose.yml up -d
```

This will:
- Start all services: PostgreSQL, Redis, Vault, Vault‑init, Django, Chess Engine, Stockfish AI, Nginx, Mailpit.
- The `vault-init` container will:
  1. Wait for Vault to become responsive.
  2. Initialize Vault (if not already initialized).
  3. Save the unseal keys and root token to `vault/tokens/`.
  4. Unseal Vault.
  5. Enable the KV v2 secrets engine.
- Then `seed_vault.sh` (run automatically as part of the Django container startup) will read the root token from `vault/tokens/tokens.json` and store all secrets from `.env` into Vault.
- Django starts after `vault-init` completes successfully.

**Check logs:**

```bash
docker logs -f trans_vault          # Vault server logs
docker logs -f trans-fork-vault-init-1   # Init/unseal logs
docker logs -f trans_backend_django      # Django logs
```

---

## Step 5: Set up AppRole (production authentication)

Django uses AppRole to authenticate with Vault (instead of a root token).  
A helper script `scripts_dev/setup-vault-approle.sh` automates this.

1. **Ensure the stack is running** (from Step 4).

2. **Run the AppRole setup script:**

   ```bash
   cd scripts_dev
   ./setup-vault-approle.sh
   ```

   This script:
   - Reads the root token from `vault/tokens/tokens.json`.
   - Creates a policy named `django-approle` with read access to `secret/django`, `secret/database`, `secret/oauth/*`.
   - Enables the AppRole auth method.
   - Creates an AppRole role with that policy.
   - Prints the generated `ROLE_ID` and `SECRET_ID`.

3. **Copy the generated role_id and secret_id** into your `.env` file:

   ```bash
   VAULT_ROLE_ID=<role_id>
   VAULT_SECRET_ID=<secret_id>
   ```

4. **Restart Django** to use the new credentials:

   ```bash
   docker compose -f docker-compose.yml restart backend_django
   ```

5. **Verify** that Django can still read secrets:

   ```bash
   docker exec trans_backend_django python manage.py shell -c "from config.vault import get_vault_secret; print(get_vault_secret('django', 'secret_key'))"
   ```

   It should print the secret without errors.

---

## Step 6: Verify everything works

Run the following checks:

```bash
# All containers running/healthy?
docker compose -f docker-compose.yml ps

# Vault unsealed and reachable?
curl -s --cacert vault/certs/ca-cert.pem https://localhost:8200/v1/sys/health | jq '.'

# Frontend responds?
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000

# Django healthcheck?
docker inspect trans_backend_django --format='{{.State.Health.Status}}'
```

All should return `healthy` / `200` / `true` as appropriate.

---

## Troubleshooting

### `vault-init` stuck on "Waiting for Vault to be ready..."

- Check that Vault is running: `docker logs trans_vault`.
- Ensure `VAULT_ADDR` and `VAULT_CACERT` are correctly set in the `vault-init` environment (they are in the compose file).

### TLS handshake errors in Django

- Verify the CA certificate is mounted correctly: `docker exec trans_backend_django ls -l /vault/certs/ca-cert.pem`.
- Check that `VAULT_CACERT` points to the correct path inside the container.
- Regenerate certificates with the script (Step 2) if they are missing extensions.

### Permission denied on `vault-key.pem`

- The key must be owned by UID 100 (the Vault container user).  
  Run `sudo chown 100:100 vault/certs/*-key.pem` and `chmod 600`.

### AppRole authentication fails

- Run `scripts_dev/setup-vault-approle.sh` again to regenerate credentials.
- Ensure the role_id and secret_id in `.env` are correct and up‑to‑date.

### Secrets not seeded into Vault

- Check that `seed_vault.sh` ran successfully: `docker logs trans_backend_django | grep "All secrets stored"`.
- If not, run it manually:
  ```bash
  docker compose -f docker-compose.yml exec -T vault-init /app/seed_vault.sh
  ```

---

## Summary

- **TLS certificates** are generated with `sudo ./scripts_dev/gen_vault_cert.sh`.
- **Environment** is configured in `.env` (AppRole credentials needed).
- **Stack starts** with `docker compose -f docker-compose.yml up -d`.
- **AppRole** is set up with `scripts_dev/setup-vault-approle.sh`.
- **Tokens** (unseal keys, root token) are persisted in `vault/tokens/` and **must not be committed to Git**.

---

## Next Steps

- Commit the working configuration (excluding sensitive files like `vault/tokens/`, `vault/certs/*-key.pem`).
- Set up a CI/CD pipeline to automate certificate renewal and secret rotation.
- In production, use a proper CA or Let's Encrypt for Vault certificates.

---

**You now have a fully functional, production‑ready Vault setup for the Transcendence stack.** 🚀

---

