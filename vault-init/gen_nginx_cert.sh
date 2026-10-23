#!/usr/bin/env sh
set -e

CERT_DIR="${CERT_DIR:-/vault/certs}"

# Validate SERVER_IP is set
if	[ -z "${SERVER_IP:-}" ]; then
	echo "❌ SERVER_IP environment variable is not set." >&2
    exit 1
fi

echo "🔐 Generating nginx certificate for IP: ${SERVER_IP}..."

# 1. Generate nginx private key
openssl genrsa -out "$CERT_DIR/nginx-key.pem" 2048

# 2. Generate nginx CSR config with dynamic SANs
cat > "$CERT_DIR/nginx.csr.cnf" <<EOF
[req]
prompt				= no
default_bits		= 2048
default_md			= sha256
req_extensions		= v3_req
distinguished_name	= dn

[dn]
CN					= nginx
O					= Transcendence

[v3_req]
subjectAltName		= @alt_names
keyUsage			= digitalSignature, keyEncipherment
extendedKeyUsage	= serverAuth

[alt_names]
DNS.1				= localhost
DNS.2				= trans_frontend_nginx
DNS.3				= ${SERVER_IP}.nip.io
IP.1				= 127.0.0.1
IP.2				= ${SERVER_IP}
EOF

# 3.Create CSR
openssl req -new \
	-key	"$CERT_DIR/nginx-key.pem" \
	-out	"$CERT_DIR/nginx.csr" \
	-subj	"/CN=nginx/O=Transcendence"

# 4. Sign with existing CA
openssl x509 -req \
	-in			"$CERT_DIR/nginx.csr" \
	-CA			"$CERT_DIR/ca-cert.pem" \
	-CAkey		"$CERT_DIR/ca-key.pem" \
	-CAserial	"$CERT_DIR/ca-cert.srl" \
	-out		"$CERT_DIR/nginx-cert.pem" \
	-days		365 -sha256 \
	-extensions	v3_req \
	-extfile	"$CERT_DIR/nginx.csr.cnf"

# 5. Set permissions — nginx (uid 101) must read the key via group
chmod 640 "$CERT_DIR/nginx-key.pem"
chmod 644 "$CERT_DIR/nginx-cert.pem"

# 6. Clean up
rm "$CERT_DIR/nginx.csr" "$CERT_DIR/nginx.csr.cnf"

echo "✅ nginx certificate generated successfully!"
echo "   nginx certificate : $CERT_DIR/nginx-cert.pem"
echo "   nginx private key : $CERT_DIR/nginx-key.pem"

