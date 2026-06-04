#!/usr/bin/env bash
# One-step build + run for Villi. Docker is the only prerequisite.
set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "[start] No .env found — creating one from .env.example."
  cp .env.example .env
fi

# Load host port overrides from .env (safe subset — no eval of arbitrary values).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PROXY_PORT="${PROXY_HOST_PORT:-8080}"
WEB_PORT="${WEB_HOST_PORT:-5173}"
API_PORT="${API_HOST_PORT:-3001}"

print_urls() {
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  Villi is ready — open in your browser:"
  echo ""
  echo "  ★ Unified (recommended):  http://localhost:${PROXY_PORT}"
  echo "    Web only:             http://localhost:${WEB_PORT}"
  echo "    API:                  http://localhost:${API_PORT}/api/v1"
  echo "    Swagger:              http://localhost:${API_PORT}/api/docs"
  echo ""
  echo "  Seeded login: shopper@villi.test / Shopper!Passw0rd"
  echo "══════════════════════════════════════════════════════════"
  echo ""
}

DETACHED=false
for arg in "$@"; do
  case "$arg" in
    -d | --detach) DETACHED=true ;;
  esac
done

echo "[start] Building and starting all services (postgres, redis, api, web, proxy)..."

if [ "$DETACHED" = true ]; then
  docker compose up --build "$@"
  print_urls
  echo "[start] Running in background. Stop with: docker compose down"
  echo "[start] Remote demo via ngrok: ./ngrok.sh"
else
  print_urls
  echo "[start] Starting (Ctrl+C to stop). URLs above stay valid once containers are healthy."
  echo ""
  docker compose up --build "$@"
fi
