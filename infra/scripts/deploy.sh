#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Deploy Script: Zero-downtime rolling update
# File: infra/scripts/deploy.sh
#
# Usage:
#   ./infra/scripts/deploy.sh [--skip-build]
# ─────────────────────────────────────────────────────────────

set -euo pipefail

COMPOSE="docker compose -f infra/docker-compose.yml"
SKIP_BUILD=false

for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
  esac
done

echo "==> [$(date)] Starting deployment"

# ── Pull latest images / rebuild ──────────────────────────────
if [ "$SKIP_BUILD" = false ]; then
  echo "==> Building images..."
  $COMPOSE build --no-cache app_api app_worker app_web
fi

# ── Run DB migrations before switching traffic ────────────────
echo "==> Running database migrations..."
$COMPOSE run --rm app_api node dist/db/migrate.js

# ── Rolling restart: API first, then worker, then web ─────────
echo "==> Restarting app_api..."
$COMPOSE up -d --no-deps app_api
sleep 10

echo "==> Restarting app_worker..."
$COMPOSE up -d --no-deps app_worker

echo "==> Restarting app_web..."
$COMPOSE up -d --no-deps app_web

# ── Health check ──────────────────────────────────────────────
echo "==> Waiting for health checks..."
sleep 15

API_STATUS=$(docker inspect --format='{{.State.Health.Status}}' app_api 2>/dev/null || echo "unknown")
WEB_STATUS=$(docker inspect --format='{{.State.Health.Status}}' app_web 2>/dev/null || echo "unknown")

if [ "$API_STATUS" != "healthy" ] || [ "$WEB_STATUS" != "healthy" ]; then
  echo "ERROR: Health check failed (api=${API_STATUS}, web=${WEB_STATUS})"
  echo "==> Rolling back..."
  $COMPOSE up -d --no-deps --scale app_api=1 app_api
  exit 1
fi

# ── Prune old images ──────────────────────────────────────────
docker image prune -f --filter "until=24h"

echo "==> [$(date)] Deployment complete"
echo "    API:    ${API_STATUS}"
echo "    Web:    ${WEB_STATUS}"
