#!/usr/bin/env bash
# Generate a self-signed TLS cert for local HTTPS (certs/key.pem, certs/cert.pem).
# start.sh does this automatically on first run — use this script only to
# regenerate certs manually, or to recover if certs/ ended up root-owned
# (e.g. Docker auto-created it as root before any cert existed).
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p certs
if [ -O certs ] || [ -w certs ]; then
  :
else
  sudo chown -R "$USER:$USER" certs
fi
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"
echo "[generate-dev-certs] Done: certs/key.pem, certs/cert.pem"
