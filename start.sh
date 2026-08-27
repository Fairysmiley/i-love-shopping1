#!/usr/bin/env bash
# One-step build + run for Villi. Docker + the Stripe CLI ("payment
# simulation CLI") are the only host prerequisites — see README's
# "Payments and Stripe CLI setup" for the one-time Stripe key/webhook setup.
set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "[start] No .env found — creating one from .env.example."
  cp .env.example .env
fi

if [ ! -f certs/key.pem ] || [ ! -f certs/cert.pem ]; then
  echo "[start] No local HTTPS cert found — generating a self-signed one (certs/key.pem, certs/cert.pem)."
  if ! command -v openssl >/dev/null 2>&1; then
    echo "[start] Error: openssl is not installed. Install it, or run ./scripts/generate-dev-certs.sh manually." >&2
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

# Payments silently degrade (checkout runs, but the payment step 500s) if
# STRIPE_SECRET_KEY isn't a real test-mode key — surface that loudly here
# instead of letting a reviewer discover it deep in a browser console.
check_stripe_setup() {
  if [ -z "${STRIPE_SECRET_KEY:-}" ] || [[ "$STRIPE_SECRET_KEY" == *dummy* ]]; then
    echo ""
    echo "  ⚠  STRIPE_SECRET_KEY is not set (or is a placeholder) in .env — checkout's"
    echo "     payment step will fail with a 500. Get free test-mode keys from"
    echo "     https://dashboard.stripe.com/test/apikeys and set STRIPE_SECRET_KEY +"
    echo "     VITE_STRIPE_PUBLIC_KEY in .env, then re-run this script."
    echo "     See README → 'Payments and Stripe CLI setup'."
  elif ! command -v stripe >/dev/null 2>&1; then
    echo ""
    echo "  ⚠  Stripe CLI ('stripe' command) not found — a successful payment will"
    echo "     never flip Order.status off PENDING, since the webhook that confirms"
    echo "     it locally never arrives. Install it: https://docs.stripe.com/stripe-cli"
    echo "     then run: stripe listen --forward-to localhost:${PROXY_PORT}/api/v1/checkout/webhook"
    echo "     See README → 'Payments and Stripe CLI setup'."
  else
    echo ""
    echo "  ℹ  Payments: remember to run, in a separate terminal, for the whole review session:"
    echo "     stripe listen --forward-to localhost:${PROXY_PORT}/api/v1/checkout/webhook"
  fi
}

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
  check_stripe_setup
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
  echo "[start] Remote demo via ngrok: ./scripts/ngrok.sh"
else
  print_urls
  echo "[start] Starting (Ctrl+C to stop). URLs above stay valid once containers are healthy."
  echo ""
  docker compose up --build "$@"
fi
