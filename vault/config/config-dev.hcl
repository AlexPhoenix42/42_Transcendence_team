# Dev configurations, no TLS, in-memory storage, auto-unsealed

# ===========================================================================
# TLS: Transport Layer Security.
# It is the protocol that encrypts communication between a 
# client (like your Django app) and a server (like Vault).

# Without TLS – data is sent as plain text. Anyone who can see the 
# network traffic (e.g., on the same network, or a compromised router) 
# can read it. That includes secrets, tokens, passwords.

# With TLS – data is encrypted. Even if someone intercepts the traffic, 
# they only see garbled nonsense.

# Why tls_disable = true in development
# * You are running everything locally (localhost, internal Docker network).
# * No one outside your machine can access Vault.
# * Setting up TLS requires certificates, which adds complexity for local testing.

# Why tls_disable = false (or omitted) in production
# * You will expose the Vault API to other services (Django).
# * Secrets like database passwords and API keys will be transmitted.
# * You must encrypt that traffic so no one can intercept and steal secrets.
# ===========================================================================

storage "inmem" {
  # In-memory storage, data is lost on restart
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true
}

ui = true

