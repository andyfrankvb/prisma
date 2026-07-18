#!/bin/bash
# ─────────────────────────────────────────────────────────────
# SSL Init Script: First-time Let's Encrypt certificate issuance
# File: infra/scripts/init-ssl.sh
#
# Run ONCE before starting the full stack:
#   chmod +x infra/scripts/init-ssl.sh
#   ./infra/scripts/init-ssl.sh
#
# Prerequisites:
#   - DNS A record for $DOMAIN pointing to this server
#   - Port 80 open and not in use
#   - infra/.env file with DOMAIN set
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# Load env
if [ -f "infra/.env" ]; then
  export $(grep -v '^#' infra/.env | xargs)
fi

DOMAIN="${DOMAIN:?DOMAIN must be set in infra/.env}"
EMAIL="${CERTBOT_EMAIL:?CERTBOT_EMAIL must be set in infra/.env}"

echo "==> Requesting certificate for: ${DOMAIN}"
echo "==> Contact email: ${EMAIL}"

# Create required directories
mkdir -p infra/certbot/conf infra/certbot/www

# Start a temporary Nginx for the ACME challenge
docker compose -f infra/docker-compose.yml up -d app_web

sleep 3

# Issue certificate
docker compose -f infra/docker-compose.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "${EMAIL}" \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  -d "${DOMAIN}" \
  -d "www.${DOMAIN}"

echo "==> Certificate issued successfully"
echo "==> Reloading Nginx..."

docker compose -f infra/docker-compose.yml exec app_web nginx -s reload

echo "==> SSL setup complete. Run 'docker compose -f infra/docker-compose.yml up -d' to start all services."
