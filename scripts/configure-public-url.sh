#!/usr/bin/env bash
# Point Villi at a single public origin (ngrok URL or custom domain).
# Rebuilds the web image so the SPA calls /api/v1 on the same host.
#
# Usage:
#   ./scripts/configure-public-url.sh https://abc123.ngrok-free.app
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ $# -ne 1 ]; then
  echo "Usage: $0 <public-url>" >&2
  echo "Example: $0 https://abc123.ngrok-free.app" >&2
  exit 1
fi

PUBLIC_URL="${1%/}"

if [[ ! "$PUBLIC_URL" =~ ^https?:// ]]; then
  echo "Error: URL must start with http:// or https://" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
fi

set_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    echo "${key}=${value}" >> .env
  fi
}

API_BASE="${PUBLIC_URL}/api/v1"

set_env API_PUBLIC_URL "$PUBLIC_URL"
set_env WEB_PUBLIC_URL "$PUBLIC_URL"
set_env VITE_API_BASE_URL "$API_BASE"
set_env GOOGLE_CALLBACK_URL "${API_BASE}/auth/oauth/google/callback"
set_env GITHUB_CALLBACK_URL "${API_BASE}/auth/oauth/github/callback"
set_env FACEBOOK_CALLBACK_URL "${API_BASE}/auth/oauth/facebook/callback"

echo "[configure] Public URL:  $PUBLIC_URL"
echo "[configure] API base:    $API_BASE"
echo "[configure] Rebuilding web + restarting api (CORS + cookies)..."

docker compose up --build -d web api

echo "[configure] Done. Open: $PUBLIC_URL"
echo "[configure] Swagger:     ${PUBLIC_URL}/api/docs"
