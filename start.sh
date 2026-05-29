#!/usr/bin/env bash
# One-step build + run for Villi. Docker is the only prerequisite.
set -e

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "[start] No .env found — creating one from .env.example."
  cp .env.example .env
fi

echo "[start] Building and starting all services (postgres, redis, api, web)..."
docker compose up --build "$@"
