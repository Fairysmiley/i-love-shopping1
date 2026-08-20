#!/usr/bin/env bash
# Start Villi behind a single-origin proxy and expose it via ngrok for remote reviewers.
#
# Prerequisites: Docker, ngrok (https://ngrok.com/download), ngrok authtoken configured.
#
# Usage:
#   ./ngrok.sh
#
# Optional — configure a known URL first (e.g. reserved ngrok domain):
#   ./ngrok.sh https://your-name.ngrok-free.app
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PROXY_PORT="${PROXY_HOST_PORT:-8080}"
if [ -f .env ] && grep -q '^PROXY_HOST_PORT=' .env; then
  PROXY_PORT="$(grep '^PROXY_HOST_PORT=' .env | cut -d= -f2)"
fi

if ! command -v ngrok >/dev/null 2>&1; then
  echo "Error: ngrok is not installed. See https://ngrok.com/download" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
fi

echo "[ngrok] Starting Docker stack (includes proxy on port ${PROXY_PORT})..."
docker compose up -d --build

wait_for_ngrok_url() {
  local attempts=0
  while [ "$attempts" -lt 30 ]; do
    if curl -sf http://127.0.0.1:4040/api/tunnels >/dev/null 2>&1; then
      local url
      url="$(python3 - <<'PY'
import json, urllib.request
data = json.load(urllib.request.urlopen("http://127.0.0.1:4040/api/tunnels"))
tunnels = data.get("tunnels") or []
# Prefer HTTPS tunnel
for t in tunnels:
    u = t.get("public_url", "")
    if u.startswith("https://"):
        print(u)
        break
else:
    if tunnels:
        print(tunnels[0].get("public_url", ""))
PY
)"
      if [ -n "$url" ]; then
        echo "$url"
        return 0
      fi
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  return 1
}

cleanup() {
  if [ -n "${NGROK_PID:-}" ] && kill -0 "$NGROK_PID" 2>/dev/null; then
    echo ""
    echo "[ngrok] Stopping tunnel..."
    kill "$NGROK_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [ -n "${1:-}" ]; then
  PUBLIC_URL="${1%/}"
  echo "[ngrok] Using provided URL: $PUBLIC_URL"
else
  echo "[ngrok] Launching tunnel → http://localhost:${PROXY_PORT}"
  ngrok http "$PROXY_PORT" --log=stdout >/tmp/villi-ngrok.log 2>&1 &
  NGROK_PID=$!

  echo "[ngrok] Waiting for public URL (ngrok dashboard: http://127.0.0.1:4040)..."
  if ! PUBLIC_URL="$(wait_for_ngrok_url)"; then
    echo "Error: could not read ngrok URL. Check /tmp/villi-ngrok.log" >&2
    exit 1
  fi
  echo "[ngrok] Tunnel: $PUBLIC_URL"
fi

"$ROOT/scripts/configure-public-url.sh" "$PUBLIC_URL"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  Share with reviewers:"
echo "    App:     $PUBLIC_URL"
echo "    Swagger: ${PUBLIC_URL}/api/docs"
echo "    Admin:   admin@villi.test / Admin!Passw0rd"
echo "    Shopper: shopper@villi.test / Shopper!Passw0rd"
echo ""
echo "  Local (same stack): http://localhost:${PROXY_PORT}"
echo "  ngrok dashboard:    http://127.0.0.1:4040"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop the ngrok tunnel."

if [ -n "${NGROK_PID:-}" ]; then
  wait "$NGROK_PID"
fi
