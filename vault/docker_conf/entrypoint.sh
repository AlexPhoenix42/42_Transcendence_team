#!/usr/bin/env sh
set -e

# ── 1. Ensure required directories exist and are owned by the 'vault' user ──
# Vault writes data to /vault/data and reads config from /vault/config.
# The 'vault' user is created in the official Vault image.
mkdir	-p /vault/config	/vault/data
chown	-R vault:vault		/vault/config	/vault/data

# ── 2. Determine mode from environment variable (default: production) ──
# Set VAULT_MODE=dev to run in development mode.
# Production mode is the default for safety.
MODE="${VAULT_MODE:-dep}"

# ── 3. Run Vault based on mode ──
if	[ "$MODE" = "dev" ]; then
    # ── Dev mode ──
    # Uses in‑memory storage, no TLS, auto‑unsealed.
    # Root token can be overridden; default "root" is fine for local testin
	TOKEN="${VAULT_DEV_ROOT_TOKEN_ID:-root}"
	echo "[entrypoint] Starting Vault in DEV mode with root token: $TOKEN"
	# 'exec' replaces the shell with Vault so Vault becomes PID 1.
	#exec vault server -dev -dev-root-token-id="$TOKEN"
	# Run dev as root, no need to drop privileges unless for testing! uncomment
	#exec su -s /bin/sh vault -c "vault server -config=\"$CONFIG_FILE\""
	exec vault server -dev -dev-listen-address=0.0.0.0:8200 -dev-root-token-id="$TOKEN"
else
	# ── Production mode ──
    # Uses persistent storage (Raft), TLS, requires manual unseal.
	CONFIG_FILE="/vault/config/config.hcl"

	# Check that the configuration file exists.
	if [ ! -f "$CONFIG_FILE" ]; then
		echo "[entrypoint] ERROR: Config file $CONFIG_FILE not found." >&2
		exit 1
	fi

	# ── Verify TLS certificate/key files if TLS is enabled in config ──
    # The config file sets tls_disable = false to enable TLS.
    # If TLS is enabled, cert.pem and key.pem must exist.
	#if	grep -q 'tls_disable\s*=\s*false' "$CONFIG_FILE"; then
	#	CERT_FILE="/vault/certs/vault-cert.pem"
	#	KEY_FILE="/vault/certs/vault-key.pem"
	#	if	[ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
	#		echo "[entrypoint] ERROR: TLS enabled but certs are missing." >&2
	#		exit 1
	#	fi
	#fi

	if	grep -q 'tls_disable\s*=\s*false' "$CONFIG_FILE"; then
		CERT_FILE="/vault/certs/vault-cert.pem"
		KEY_FILE="/vault/certs/vault-key.pem"

		echo "[entrypoint] Waiting for TLS certificates to be available..."

		atmpt=0
		max_atmpts=30

		while [ $atmpt -lt $max_atmpts ]; do
			if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
				break
			fi
			atmpt=$(($atmpt+1))
			sleep 2
		done

		if	[ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
			echo "[entrypoint] ERROR: TLS enabled but certs are missing after waiting." >&2
			exit 1
		fi

		echo "[entrypoint] TLS certificates ready."
	fi

	echo "[entrypoint] Starting Vault in PRODUCTION mode with config: $CONFIG_FILE"
	# 'exec' replaces the shell with Vault so Vault becomes PID 1.
	exec su -s /bin/sh vault -c "vault server -config=\"$CONFIG_FILE\""
	#exec vault server -config="$CONFIG_FILE"
fi

