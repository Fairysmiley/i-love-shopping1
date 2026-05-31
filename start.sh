#!/usr/bin/env bash
# One-step build + run for Villi. Docker is the only prerequisite.
set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "[start] No .env found — creating one from .env.example."
  cp .env.example .env
fi

echo "[start] Building and starting all services (postgres, redis, api, web, proxy)..."
docker compose up --build "$@"

echo ""
echo "[start] Local URLs:"
echo "  Unified (recommended): http://localhost:${PROXY_HOST_PORT:-8080}"
echo "  Web only:              http://localhost:${WEB_HOST_PORT:-5173}"
echo "  API only:              http://localhost:${API_HOST_PORT:-3001}/api/v1"
echo ""
echo "[start] Remote demo via ngrok: ./ngrok.sh"
