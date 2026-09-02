
I have conducted thorough research on production-grade Vault deployments, including official HashiCorp documentation and industry best practices. Based on that, here is a comprehensive, production-proof plan.

---

## Production Vault Deployment Plan

### Executive Summary

This plan transitions your Vault deployment from development (in-memory, auto-unsealed, root token) to a production-grade system with:

- **Raft storage** for persistence and high availability
- **TLS encryption** for all communication
- **Manual unsealing** with secure key management
- **AppRole authentication** for Django (no root token)
- **Automated backup and recovery**
- **Monitoring and alerting**

---

### Phase 1: Prerequisites and Preparation

#### 1.1 Certificate Generation (TLS)

Production Vault **must** use TLS. Generate a self-signed certificate for testing (replace with CA-signed for production):

```bash
# Create directory for certificates
mkdir -p vault/certs

# Generate private key and self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout vault/certs/vault-key.pem \
  -out vault/certs/vault-cert.pem -days 365 -nodes \
  -subj "/CN=vault/O=Transcendence"
```

> **Production note**: Replace self-signed certificates with certificates from a trusted CA (e.g., Let's Encrypt, internal PKI) for production deployment.

#### 1.2 Persistent Volume Preparation

Raft storage requires persistent storage. Ensure your volume is ready:

```bash
# For Docker Compose with named volume (already configured)
docker volume create vault_data

# Or for bind mount (verify directory exists and is writable)
mkdir -p /path/to/vault/data
sudo chown 100:100 /path/to/vault/data
```

#### 1.3 Environment Variables Review

Add to `.env` for production:

```env
VAULT_MODE=dep
VAULT_ADDR=https://vault:8200
VAULT_CACERT=/vault/certs/vault-cert.pem
```

---

### Phase 2: Configuration Files

#### 2.1 Production Configuration (`vault/docker_conf/config-dep.hcl`)

Your existing configuration is already correct for production. Verify it includes:

```hcl
# Persistent storage with Raft
storage "raft" {
  path = "/vault/data"
  node_id = "node1"
}

# TLS-enabled listener
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = false
  tls_cert_file = "/vault/certs/vault-cert.pem"
  tls_key_file  = "/vault/certs/vault-key.pem"
}

# API and cluster addresses for HA
api_addr     = "https://vault:8200"
cluster_addr = "https://vault:8201"

# UI and logging
ui = true
log_level = "info"
```

#### 2.2 Dockerfile (`vault/docker_conf/Dockerfile`) – already correct

Your multi-stage Dockerfile with `dev` and `dep` targets is production-ready. Ensure the `dep` stage copies certificates:

```dockerfile
# --- Dep Stage ---
FROM base AS dep

COPY --chown=vault:vault docker_conf/config-dep.hcl /vault/config/config.hcl
COPY --chown=vault:vault certs/vault-cert.pem /vault/certs/vault-cert.pem
COPY --chown=vault:vault certs/vault-key.pem /vault/certs/vault-key.pem

EXPOSE 8200
ENV VAULT_MODE=dep
ENTRYPOINT ["/entrypoint.sh"]
```

#### 2.3 Entrypoint (`vault/docker_conf/entrypoint.sh`) – already correct

Your entrypoint script handles both dev and production modes correctly. The production branch validates config and TLS certificates before starting.

---

### Phase 3: Docker Compose Production Configuration

#### 3.1 Update `docker-compose.yml`

```yaml
vault:
  build:
    context:      vault
    dockerfile:   docker_conf/Dockerfile
    target:       dep                    # production target
    pull:         false
    cache_from:
      - type=local,src=${HOME}/goinfre/trans_cache/vault
    cache_to:
      - type=local,dest=${HOME}/goinfre/trans_cache/vault,mode=max
  container_name: trans_vault
  restart:        unless-stopped
  environment:
    VAULT_MODE:   dep                    # production mode
    # VAULT_DEV_ROOT_TOKEN_ID is REMOVED (not used in production)
  ports:
    - "8200:8200"
  volumes:
    - vault_data:/vault/data             # persistent storage
    - ./vault/certs:/vault/certs:ro      # TLS certificates (read-only)
  networks:
    - trans_net
  healthcheck:
    test: ["CMD", "vault", "status"]
    interval:     10s
    timeout:      5s
    retries:      5
    start_period: 30s                    # increased for production (unsealing takes time)

# Named volume for persistence
volumes:
  vault_data:
    # For production, consider using a specific driver or external volume
```

#### 3.2 Update `backend_django` Dependencies

```yaml
backend_django:
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
    vault:
      condition: service_healthy       # Django waits for Vault to be unsealed
```

**Note:** The `vault-init` container is **not needed** in production because secrets persist across restarts. Secrets are seeded once during initial setup.

---

### Phase 4: Initialisation and Unsealing (First Time Only)

#### 4.1 Start Vault

```bash
docker compose up -d vault
```

#### 4.2 Initialise Vault

```bash
docker compose exec vault vault operator init
```

This outputs:

```
Unseal Key 1: xxxxx
Unseal Key 2: xxxxx
Unseal Key 3: xxxxx
Unseal Key 4: xxxxx
Unseal Key 5: xxxxx
Initial Root Token: xxxxx
```

**CRITICAL**: Save these securely. They are required to unseal Vault after every restart. Store them in a secure location (e.g., password manager, encrypted file, HSM).

#### 4.3 Unseal Vault

You need the threshold number of keys (default: 3 of 5). Run:

```bash
docker compose exec vault vault operator unseal
# Enter Unseal Key 1
docker compose exec vault vault operator unseal
# Enter Unseal Key 2
docker compose exec vault vault operator unseal
# Enter Unseal Key 3
```

Verify unsealed status:

```bash
docker compose exec vault vault status
# Sealed: false
```

#### 4.4 Login with Root Token

```bash
docker compose exec vault vault login
# Enter the Initial Root Token from step 4.2
```

**Note**: The root token should be used only for initial setup, then revoked after AppRole is configured.

---

### Phase 5: AppRole Authentication (Production)

#### 5.1 Enable AppRole

```bash
docker compose exec vault vault auth enable approle
```

#### 5.2 Create a Policy for Django

Create a policy file `vault/policies/django-policy.hcl`:

```hcl
# Read access to Django secrets
path "secret/data/django" {
  capabilities = ["read"]
}

# Read access to database secrets
path "secret/data/database" {
  capabilities = ["read"]
}

# Read access to OAuth secrets
path "secret/data/oauth/*" {
  capabilities = ["read"]
}

# List access to secret paths (if needed)
path "secret/metadata/*" {
  capabilities = ["list"]
}
```

Apply the policy:

```bash
docker compose exec vault vault policy write django-policy /vault/policies/django-policy.hcl
```

#### 5.3 Create AppRole

```bash
docker compose exec vault vault write auth/approle/role/django-role \
  token_ttl=1h \
  token_max_ttl=4h \
  policies="django-policy"
```

#### 5.4 Retrieve Role ID and Secret ID

```bash
# Role ID (static, can be stored in environment)
docker compose exec vault vault read auth/approle/role/django-role/role-id

# Secret ID (dynamic, treat like a password)
docker compose exec vault vault write -f auth/approle/role/django-role/secret-id
```

#### 5.5 Store Credentials Securely

Add to Django's environment (or Kubernetes secret, or your secure configuration management):

```env
VAULT_ROLE_ID=xxxxx
VAULT_SECRET_ID=xxxxx
```

#### 5.6 Revoke Root Token (Optional but Recommended)

```bash
docker compose exec vault vault token revoke -self
```

---

### Phase 6: Secret Migration

#### 6.1 Seed Secrets Once

```bash
# Store Django secret key
docker compose exec vault vault kv put secret/django \
  secret_key="your-production-secret-key"

# Store database credentials
docker compose exec vault vault kv put secret/database \
  user="your-db-user" \
  password="your-db-password"

# Store OAuth credentials
docker compose exec vault vault kv put secret/oauth/42 \
  client_id="your-42-client-id" \
  client_secret="your-42-client-secret"

docker compose exec vault vault kv put secret/oauth/google \
  client_id="your-google-client-id" \
  client_secret="your-google-client-secret"
```

#### 6.2 Verify Secrets

```bash
docker compose exec vault vault kv get secret/django
docker compose exec vault vault kv get secret/database
```

---

### Phase 7: Django Integration (Already Done)

Your `config/vault.py` already supports AppRole authentication. Update `.env` for production:

```env
VAULT_ADDR=https://vault:8200
VAULT_AUTH_METHOD=approle
VAULT_ROLE_ID=xxxxx
VAULT_SECRET_ID=xxxxx
VAULT_CACERT=/path/to/ca-cert.pem  # if using self-signed certificates
```

**Note**: If using self-signed certificates, you may need to set `verify=False` in the `hvac.Client` constructor (temporarily) or provide the CA certificate.

---

### Phase 8: Backup and Disaster Recovery

#### 8.1 Regular Snapshots

Create a backup script `scripts/backup_vault.sh`:

```bash
#!/bin/bash
set -e

BACKUP_DIR="/backups/vault"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SNAPSHOT_FILE="${BACKUP_DIR}/vault_snapshot_${TIMESTAMP}.snap"

# Take snapshot
docker compose exec vault vault operator raft snapshot save /tmp/snapshot.snap
docker compose cp trans_vault:/tmp/snapshot.snap "${SNAPSHOT_FILE}"
docker compose exec vault vault operator raft snapshot delete /tmp/snapshot.snap

# Compress and rotate (keep last 7 days)
gzip "${SNAPSHOT_FILE}"
find "${BACKUP_DIR}" -name "*.snap.gz" -mtime +7 -delete

echo "Backup completed: ${SNAPSHOT_FILE}.gz"
```

#### 8.2 Restore from Snapshot

```bash
# Stop Vault
docker compose stop vault

# Restore from snapshot
docker compose exec vault vault operator raft snapshot restore /path/to/snapshot.snap

# Start Vault
docker compose start vault
# Unseal Vault (same process as Phase 4)
```

---

### Phase 9: Monitoring and Alerting

#### 9.1 Health Check Monitoring

Vault's health endpoint provides detailed status:

```bash
curl -s https://vault:8200/v1/sys/health | jq '.'
```

#### 9.2 Prometheus Metrics (Optional)

Enable Prometheus metrics:

```hcl
# Add to config-dep.hcl
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname = true
}
```

Then scrape metrics from `http://vault:8200/v1/sys/metrics`.

#### 9.3 Audit Logging

Enable audit logging to track all access:

```bash
docker compose exec vault vault audit enable file file_path=/vault/logs/audit.log
```

---

### Phase 10: Production Checklist

| Task | Status | Notes |
|------|--------|-------|
| TLS certificates generated and deployed | ⬜ | Use CA-signed for production |
| Raft storage configured with persistent volume | ⬜ | Volume must survive restarts |
| `target: dep` set in compose | ⬜ | |
| `VAULT_MODE=dep` set in environment | ⬜ | |
| `VAULT_DEV_ROOT_TOKEN_ID` removed | ⬜ | Critical! |
| Vault initialised and unsealed | ⬜ | Save unseal keys securely |
| AppRole enabled and configured | ⬜ | |
| Django configured with AppRole credentials | ⬜ | |
| Secrets migrated to Vault | ⬜ | |
| Backup script in place | ⬜ | Test restore procedure |
| Monitoring and alerting configured | ⬜ | |
| Audit logging enabled | ⬜ | |
| `vault-init` container disabled/removed | ⬜ | Not needed in production |

---

### Appendix A: Handling the Unseal Process

**Option 1: Manual Unseal (Recommended for Single-Node)**

Unseal Vault after every restart using the unseal keys stored securely.

**Option 2: Auto-Unseal (Enterprise/Cloud KMS)**

For production with high availability, configure auto-unseal using cloud KMS:

```hcl
seal "awskms" {
  region     = "us-west-2"
  kms_key_id = "your-kms-key-id"
}
```

**Option 3: Scripted Unseal**

For development/staging, you can script the unseal:

```bash
#!/bin/bash
# unseal_vault.sh
KEYS=("key1" "key2" "key3")
for KEY in "${KEYS[@]}"; do
  docker compose exec vault vault operator unseal "$KEY"
done
```

---

### Appendix B: High Availability (HA) Configuration

For true production HA, deploy multiple Vault nodes:

```yaml
vault-1:
  environment:
    VAULT_RAFT_NODE_ID: node1
    VAULT_RAFT_ADDR: https://vault-1:8201

vault-2:
  environment:
    VAULT_RAFT_NODE_ID: node2
    VAULT_RAFT_ADDR: https://vault-2:8201

vault-3:
  environment:
    VAULT_RAFT_NODE_ID: node3
    VAULT_RAFT_ADDR: https://vault-3:8201
```

Bootstrap the cluster after initialization:

```bash
docker compose exec vault-1 vault operator raft join https://vault-2:8200
docker compose exec vault-1 vault operator raft join https://vault-3:8200
```

---

### Summary

This plan covers everything needed to deploy Vault in production:

1. **TLS certificates** for encrypted communication
2. **Raft storage** for persistence and HA
3. **Manual unsealing** with secure key management
4. **AppRole authentication** for Django
5. **Backup and recovery** with regular snapshots
6. **Monitoring and audit logging** for observability

The plan is production-proof because it follows HashiCorp best practices, includes disaster recovery procedures, and maintains security at every layer.

---

