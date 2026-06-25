#!/usr/bin/env bash
# Generate a self-signed TLS cert for the print bridge.
# Run once on the bridge machine. Then on each iPad: AirDrop cert.pem to
# the device, open it, install profile in Settings -> General -> VPN & Device
# Management, then enable full trust in Settings -> General -> About ->
# Certificate Trust Settings.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)/cert"
mkdir -p "$DIR"

# Detect this host's primary LAN IP for the SAN
HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ -z "$HOST_IP" ]; then
  HOST_IP="$(ipconfig getifaddr en0 2>/dev/null || echo 192.168.1.50)"
fi

cat > "$DIR/openssl.cnf" <<EOF
[req]
distinguished_name = dn
req_extensions     = v3_req
prompt             = no
[dn]
CN = print-bridge.local
[v3_req]
subjectAltName = @alt
[alt]
DNS.1 = print-bridge.local
DNS.2 = localhost
IP.1  = $HOST_IP
IP.2  = 127.0.0.1
EOF

openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout "$DIR/key.pem" -out "$DIR/cert.pem" \
  -config "$DIR/openssl.cnf" -extensions v3_req

echo
echo "Cert written to $DIR"
echo "LAN IP used: $HOST_IP"
echo "Install $DIR/cert.pem on each iPad / Android tablet."
