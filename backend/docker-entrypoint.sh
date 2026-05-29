#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
npx prisma migrate deploy

# Idempotent seed (upserts). Disable with SEED_ON_START=false.
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] Seeding database..."
  node dist-seed/seed.js || echo "[entrypoint] Seed skipped/failed (continuing)."
fi

echo "[entrypoint] Starting API..."
exec "$@"
