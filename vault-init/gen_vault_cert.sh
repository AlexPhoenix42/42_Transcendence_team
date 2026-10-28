#!/usr/bin/env sh
set -e

CERT_DIR="${CERT_DIR:-/vault/certs}"

# -1. Generate self-signed certificate and private key (old self-signed cert)
#openssl req -x509 -newkey rsa:4096 -keyout ./vault/certs/vault-key.pem \
#	-out	./vault/certs/vault-cert.pem -days 365 -nodes \
#	-subj	"/CN=vault/O=Transcendence"

# 0. Create directory for the certificates
mkdir -p "$CERT_DIR"

rm -f "$CERT_DIR/ca-key.pem" "$CERT_DIR/ca-cert.pem" \
      "$CERT_DIR/ca-cert.srl" \
      "$CERT_DIR/vault-key.pem" "$CERT_DIR/vault-cert.pem"

# 1. Create the Certifacte Authority (CA)
# This CA is what clients will trust. It's self-signed,
# but that's correct for a root CA.
# Valid for 10 years (3650 days) plenty for a root CA.
openssl genrsa -out "$CERT_DIR/ca-key.pem" 2048

openssl req	-new -x509 -days 3650 \
	-key	"$CERT_DIR/ca-key.pem" \
	-out	"$CERT_DIR/ca-cert.pem" \
	-subj	"/CN=Vault CA/O=Transcendence" \
	-addext	"basicConstraints=critical,CA:TRUE" \
	-addext "keyUsage=keyCertSign,cRLSign"

# 2. Genrate the Vault server private key
openssl genrsa -out "$CERT_DIR/vault-key.pem" 2048

# 3. Create a CSR with SANs
cat > "$CERT_DIR/vault.csr.cnf" <<EOF
[req]
prompt				= no
default_bits		= 2048
default_md			= sha256
req_extensions		= v3_req
distinguished_name	= dn

[dn]
CN					= Vault
O					= Transcendence

[v3_req]
subjectAltName		= @alt_names
keyUsage			= digitalSignature, keyEncipherment
extendedKeyUsage	= serverAuth

[alt_names]
DNS.1				= vault
DNS.2				= localhost
IP.1				= 127.0.0.1
EOF

# 4. Create a Certificate Signing Request (CSR)
# The CSR is a formal request for the CA to sign the Vault certificate.
openssl req -new \
	-key	"$CERT_DIR/vault-key.pem" \
	-out	"$CERT_DIR/vault.csr" \
	-subj	"/CN=Vault/O=Transcendence"

# 5. Sign the CSR with the CA
# This creates the final, trusted Vault Certificate.
openssl x509 -req \
	-in	"$CERT_DIR/vault.csr" \
	-CA	"$CERT_DIR/ca-cert.pem" \
	-CAkey	"$CERT_DIR/ca-key.pem" \
	-CAcreateserial \
	-out	"$CERT_DIR/vault-cert.pem" \
	-days 365 -sha256 \
	-extensions v3_req \
	-extfile "$CERT_DIR/vault.csr.cnf"

#sudo chown -R 100:100 ./vault/certs/	# no need since we are inside the container
chmod 600 "$CERT_DIR/ca-key.pem" "$CERT_DIR/vault-key.pem"
chmod 644 "$CERT_DIR/ca-cert.pem" "$CERT_DIR/vault-cert.pem" "$CERT_DIR/ca-cert.srl"

# 6. Clean up the CSR (no longer needed)
rm	"$CERT_DIR/vault.csr" "$CERT_DIR/vault.csr.cnf"

echo "✅ Certificates generated successfully!"
echo "   CA certificate		: $CERT_DIR/ca-cert.pem"
echo "   Vault certificate	: $CERT_DIR/vault-cert.pem"
echo "   Vault private key	: $CERT_DIR/vault-key.pem"

