#!/usr/bin/env sh
set -e

# Validate SERVER_IP is set
if	[ -z "${SERVER_IP:-}" ]; then
	echo "❌ SERVER_IP environment variable is not set." >&2
    exit 1
fi

echo "🔐 Generating nginx certificate for IP: ${SERVER_IP}..."

# 1. Generate nginx private key
openssl genrsa -out /vault/certs/nginx-key.pem 2048

# 2. Generate nginx CSR config with dynamic SANs
cat > /vault/certs/nginx.csr.cnf <<EOF
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
	-key	/vault/certs/nginx-key.pem \
	-out	/vault/certs/nginx.csr \
	-subj	"/CN=nginx/O=Transcendence"

# 4. Sign with existing CA
openssl x509 -req \
	-in			/vault/certs/nginx.csr \
	-CA			/vault/certs/ca-cert.pem \
	-CAkey		/vault/certs/ca-key.pem \
	-CAserial	/vault/certs/ca-cert.srl \
	-out		/vault/certs/nginx-cert.pem \
	-days		365 -sha256 \
	-extensions	v3_req \
	-extfile	/vault/certs/nginx.csr.cnf

# 5. Set permissions — nginx (uid 101) must read the key via group
chown 100:101 /vault/certs/nginx-key.pem
chmod 640 /vault/certs/nginx-key.pem
chmod 644 /vault/certs/nginx-cert.pem

# 6. Clean up
rm /vault/certs/nginx.csr /vault/certs/nginx.csr.cnf

echo "✅ nginx certificate generated successfully!"
echo "   nginx certificate : /vault/certs/nginx-cert.pem"
echo "   nginx private key : /vault/certs/nginx-key.pem"

