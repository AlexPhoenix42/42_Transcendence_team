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

# Entrypoint chowns /vault/data (a host bind mount outside the 42 goinfre
# setup can be owned by a different uid than the image's 'vault' user, which
# then can't chown it without CAP_CHOWN) - same fix the dep stage already
# uses below, for the same reason.
USER	root

EXPOSE	8200

# Run vault in dev mode (auto-unsealed, in-memory storage)
# Vault_DEV_ROOT_TOKEN_ID can be overridden via environment
ENV			VAULT_MODE=dev
ENTRYPOINT	["/entrypoint.sh"]

# --- Dep Stage ---
FROM	base AS dep

# Copy production configuration
COPY	--chown=vault:vault config/config-dep.hcl	/vault/config/config.hcl

#COPY	--chown=vault:vault --chmod=600 \
#certs/vault-key.pem		/vault/certs/vault-key.pem
#
#COPY	--chown=vault:vault --chmod=644 \
#certs/vault-cert.pem	/vault/certs/vault-cert.pem
#
#COPY	--chown=vault:vault --chmod=644 \
#certs/ca-cert.pem		/vault/certs/ca-cert.pem

# Run entrypoint as root to set permissions
USER	root

EXPOSE	8200

# Run Vault in production mode with the provided config
ENV			VAULT_MODE=dep
ENTRYPOINT	["/entrypoint.sh"]

