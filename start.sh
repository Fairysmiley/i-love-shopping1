#!/usr/bin/env bash
# One-step build + run for Villi. Docker is the only prerequisite.
set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "[start] No .env found — creating one from .env.example."
  cp .env.example .env
fi

if [ ! -f certs/key.pem ] || [ ! -f certs/cert.pem ]; then
  echo "[start] No local HTTPS cert found — generating a self-signed one (certs/key.pem, certs/cert.pem)."
  if ! command -v openssl >/dev/null 2>&1; then
    echo "[start] Error: openssl is not installed. Install it, or run ./ngrok/generate-dev-certs.sh manually." >&2
    exit 1
  fi
  mkdir -p certs
  openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost" >/dev/null 2>&1
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
MAILHOG_WEB_PORT="${MAILHOG_WEB_PORT:-18025}"
SMTP_HOST_EFFECTIVE="${SMTP_HOST:-mailhog}"

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
  if [ -n "$SMTP_HOST_EFFECTIVE" ]; then
    echo "  Mailhog inbox:        http://localhost:${MAILHOG_WEB_PORT}  (password reset emails)"
  else
    echo "  Dev email:            docker compose logs api | grep \"DEV EMAIL\""
  fi
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
  echo "[start] Remote demo via ngrok: ./ngrok/ngrok.sh"
else
  print_urls
  echo "[start] Starting (Ctrl+C to stop). URLs above stay valid once containers are healthy."
  echo ""
  docker compose up --build "$@"
fi
