# Production configuration, persistent storage, TLS, manual useal

# ==========================================================================
# What it does: Tells Vault to use Raft Integrated Storage which is 
# a distributed, persistent storage backend built into Vault.

# path = "/vault/data" where data is stored on disk. 
# This directory must be persisted via a volume mount.

# node_id = "node1" – unique identifier for this node in the cluster.

# Why: In production, you need data to survive restarts and crashes. 
# Raft also supports high availability, you can run multiple Vault nodes in a cluster.

# Alternative for dev: storage "inmem" – data lost on restart.

disable_mlock = true

storage "raft" {
  path    = "/vault/data"
  node_id = "node1"
}
# ==========================================================================

# ==========================================================================
# What it does: Configures the network listener.
# address = "0.0.0.0:8200" -> listens on all network interfaces.

# tls_disable = false -> enables TLS (encryption).

# tls_cert_file and tls_key_file are paths to your TLS certificate and private key.

# Why: In production, all communication must be encrypted. 
# Secrets like database passwords and API keys are transmitted over the network 
# and they must be protected from interception.
#Alternative for dev: tls_disable = true – no TLS for local testing.

listener "tcp" {
  address         = "0.0.0.0:8200"
  tls_disable     = false
  tls_cert_file   = "/vault/certs/vault-cert.pem"
  tls_key_file    = "/vault/certs/vault-key.pem"
}
# ==========================================================================

# ==========================================================================
# What they do:
# api_addr is the URL other services (like Django) use to reach Vault.
# cluster_addr is the URL Vault nodes use to communicate with each other 
# (for HA="High Availabilty" in case of running multiple Vault servers).

# Why: Vault needs to know its own address so it can advertise it to clients 
# and other nodes. In a cluster, nodes need to talk to each other.

# Alternative for dev: Not needed! the dev mode uses defaults.
api_addr        = "https://vault:8200"
# this is not needed because we are only a single-node deployment
# this is needed in ourcase by Raft storage anyway!
cluster_addr    = "https://vault:8201"
# ==========================================================================

# ==========================================================================
ui              = true
log_level       = "info"
# ==========================================================================

