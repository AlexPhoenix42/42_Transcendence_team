
---

## Recap

We successfully moved the stack to a production-oriented secret management design using HashiCorp Vault.

### Final state

All containers are running and healthy:

- `trans_vault` — healthy
- `trans_db_server` — healthy
- `trans_backend_django` — healthy
- `trans_frontend_nginx` — healthy
- `trans_redis` — healthy
- `trans_timeout_checker` — running
- `vault-init` — exited successfully after setup

### What was achieved

1. **Vault is now the central secret manager**

   - Runs in production mode with TLS and Raft storage.
   - Initializes/unseals automatically via a one-shot `vault-init` service.
   - Encrypts its own bootstrap secrets (unseal keys + root token) into `vault-bootstrap.enc`.
   - Does not store plaintext unseal keys or root token.

2. **Encrypted secret bootstrap flow**

   - Plain `.env` now contains only non-secret configuration.
   - Sensitive values live in `.env.secrets.enc`.
   - `run_dep_secure.sh` prompts for a passphrase once, decrypts secrets to `/dev/shm`, passes them only to `vault-init`, then deletes the file after Docker Compose exits.

3. **All services now fetch secrets from Vault**

   - **Django** reads SECRET_KEY, DB credentials, and OAuth client IDs/secrets from Vault.
   - **Postgres** uses a custom Vault entrypoint to fetch DB credentials and write them to `/dev/shm` files before starting.
   - **timeout_checker** uses a similar Vault entrypoint to fetch DB credentials from Vault.

4. **AppRole access control**

   - Separate Vault AppRoles and policies for Django, Postgres, and timeout_checker.
   - Credentials are written to `/vault/approle` with restrictive permissions (`640`, group `users`).
   - Containers are added to the shared `users` group (GID 100) so they can read only their own credentials.

5. **Resolved several startup/race issues**

   - Vault healthcheck now has a longer `start_period` to allow initialization.
   - `vault-init` waits for Vault to become active leader (`ha_mode == "active"`) before seeding.
   - Backend healthcheck timeout increased to avoid false unhealthy status.
   - Postgres `command: ["postgres"]` added to ensure official entrypoint receives the correct argument.

---

### Immediate next possible steps

- Commit this working state safely.
- Make `vault-init` run after Vault restarts/recreates to prevent sealed state.
- Start WAF/ModSecurity implementation.
- Clean up unused scripts and document the new flow.

This is a strong checkpoint. The secret management architecture is working end-to-end.

