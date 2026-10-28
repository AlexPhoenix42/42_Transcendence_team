# syntax=docker/dockerfile:1

# --- Base Stage ---
FROM	hashicorp/vault:latest AS base

WORKDIR	/vault

# Vault runs as non-root user 'vault' by default.
# We will create the config directory and ensure its owned by vault.
RUN		mkdir -p config && chown vault:vault /vault/config
RUN		mkdir -p certs  && chown vault:vault /vault/certs


# Copy entrypoint script (same for dev and dep)
COPY	--chown=vault:vault docker_conf/entrypoint.sh /entrypoint.sh
RUN		chmod +x /entrypoint.sh

# --- Dev Stage ---
FROM	base AS dev

# Copy dev configuration
COPY	--chown=vault:vault config/config-dev.hcl	/vault/config/config.hcl

EXPOSE	8200

# Run vault in dev mode (auto-unsealed, in-memory storage)
# Vault_DEV_ROOT_TOKEN_ID can be overridden via environment
ENV			VAULT_MODE=dev
ENTRYPOINT	["/entrypoint.sh"]

# --- Dep Stage ---
FROM	base AS dep

# Copy production configuration
COPY	--chown=vault:vault config/config-dep.hcl	/vault/config/config.hcl

# Run entrypoint as root to set permissions
USER	root

EXPOSE	8200

# Run Vault in production mode with the provided config
ENV			VAULT_MODE=dep
ENTRYPOINT	["/entrypoint.sh"]

