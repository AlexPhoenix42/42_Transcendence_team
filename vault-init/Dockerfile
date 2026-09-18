FROM	hashicorp/vault:latest

# Install jq
USER	root
RUN		apk add --no-cache jq openssl postgresql-client

# Create shared group for services that need to read Vault credentials
RUN		addgroup -g 100 users || true \
		&& addgroup vault users

# Copy the script
COPY	./gen_vault_cert.sh		/app/gen_vault_cert.sh
RUN		chmod +x /app/gen_vault_cert.sh

COPY	./gen_nginx_cert.sh		/app/gen_nginx_cert.sh
RUN		chmod +x /app/gen_nginx_cert.sh

COPY	./init_unseal_vault.sh	/app/init_unseal_vault.sh
RUN		chmod +x /app/init_unseal_vault.sh

# Switch to the official non-root user
USER	vault

ENTRYPOINT	["/bin/sh", "/app/init_unseal_vault.sh"]

