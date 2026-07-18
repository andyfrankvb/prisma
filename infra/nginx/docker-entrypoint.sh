#!/bin/sh
# ─────────────────────────────────────────────────────────────
# Nginx entrypoint: sustituye variables de entorno en la config
# File: infra/nginx/docker-entrypoint.sh
#
# Usa envsubst para reemplazar SOLO ${DOMAIN} en la plantilla.
# Las variables nativas de Nginx ($host, $remote_addr, etc.)
# se pasan como literales a envsubst para que NO sean tocadas.
# ─────────────────────────────────────────────────────────────

set -e

# ── Validar que DOMAIN esté definido ─────────────────────────
if [ -z "${DOMAIN}" ]; then
  echo "[entrypoint] ERROR: La variable de entorno DOMAIN no está definida."
  echo "             Agrega DOMAIN=tu-dominio.com en infra/.env"
  exit 1
fi

echo "[entrypoint] Generando configuración de Nginx para dominio: ${DOMAIN}"

# ── Sustituir SOLO ${DOMAIN} — proteger variables de Nginx ───
#
# envsubst recibe como segundo argumento la lista de variables
# que SÍ debe sustituir. Todo lo demás lo deja intacto.
# Esto evita que $host, $remote_addr, $scheme, etc. sean
# reemplazados por cadenas vacías.
#
envsubst '${DOMAIN}' \
  < /etc/nginx/templates/app.conf.template \
  > /etc/nginx/conf.d/app.conf

echo "[entrypoint] Configuración generada en /etc/nginx/conf.d/app.conf"

# ── Verificar sintaxis antes de arrancar ─────────────────────
nginx -t

echo "[entrypoint] Sintaxis OK. Iniciando Nginx…"

# ── Ejecutar el comando original del contenedor Nginx ────────
exec "$@"
