
---

## ✅ Plan: Shell Script First, Vault Agent Later

That is a solid, pragmatic approach. You'll:

1. **Start with a shell script** – get everything working, understand the pieces.
2. **Then replace it with Vault Agent** – improve security and automation.

---

## Step 1 – Shell Script for AppRole Setup

**Create a script:** `scripts_dev/setup-vault-approle.sh`

**What it does:**

- Checks if AppRole is already enabled.
- Creates the policy (idempotent).
- Creates the AppRole (idempotent).
- Retrieves the `role_id` and generates a new `secret_id`.
- Outputs the credentials so you can copy them into `.env`.

**The script:**

```bash
#!/usr/bin/env bash
set -e

echo "🔐 Setting up Vault AppRole for Django..."

# 1. Enable AppRole (idempotent)
if ! vault auth list -format=json | grep -q '"approle/"'; then
    vault auth enable approle
    echo "✅ AppRole enabled."
else
    echo "✅ AppRole already enabled."
fi

# 2. Write policy (idempotent)
vault policy write django-policy - <<EOF
path "secret/data/django" {
  capabilities = ["read"]
}
path "secret/data/database" {
  capabilities = ["read"]
}
path "secret/data/oauth/*" {
  capabilities = ["read"]
}
EOF
echo "✅ Policy 'django-policy' written."

# 3. Create/update AppRole (idempotent)
vault write auth/approle/role/django-role \
    token_ttl=1h \
    token_max_ttl=4h \
    policies="django-policy" \
    > /dev/null 2>&1 || true
echo "✅ AppRole 'django-role' configured."

# 4. Retrieve credentials
ROLE_ID=$(vault read -field=role_id auth/approle/role/django-role/role-id)
SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/django-role/secret-id)

echo ""
echo "=========================================="
echo "✅ AppRole Credentials"
echo "=========================================="
echo "VAULT_ROLE_ID=$ROLE_ID"
echo "VAULT_SECRET_ID=$SECRET_ID"
echo "=========================================="
echo ""
echo "Add these to your .env file and restart Django."
```

---

## Step 2 – How to Run It

**From your project root (where `docker-compose.yml` lives):**

```bash
docker compose exec -T vault /bin/sh -c "$(cat scripts_dev/setup-vault-approle.sh)"
```

Or copy the script into the container and run it, but the above works.

---

## Step 3 – Update `.env` with the output

Copy the `VAULT_ROLE_ID` and `VAULT_SECRET_ID` from the script output into your `.env` file:

```env
VAULT_URL=https://vault:8200
VAULT_AUTH_METHOD=approle
VAULT_ROLE_ID=xxxxxxxxxx
VAULT_SECRET_ID=yyyyyyyyyy
```

---

## Step 4 – Restart Django

```bash
docker compose up -d backend_django
```

---

## Later – Vault Agent

When you're ready to replace the script with Vault Agent, the Agent will:

- Run as a sidecar container.
- Authenticate using AppRole (`role_id` and `secret_id` provided as files).
- Write secrets to a shared volume that Django reads.
- Auto‑renew credentials and secrets.

But that's a separate step. First, get the script working.

---

## ✅ Summary

| Step | Action |
|------|--------|
| 1 | Create `scripts_dev/setup-vault-approle.sh` |
| 2 | Run it once to generate credentials |
| 3 | Copy credentials into `.env` |
| 4 | Restart Django |

Then you can manually test that Django is now using AppRole instead of root token.

---

