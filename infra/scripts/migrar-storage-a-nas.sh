#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Migra los archivos ya subidos (volumen Docker actual) hacia el NAS.
#
# Se corre UNA vez, ANTES de levantar la app con el override del NAS.
# Copia (no borra el origen) para poder verificar antes de cambiar.
#
# Requisitos:
#   · El NAS ya montado en el host en la ruta que le pases como argumento,
#     O accesible por Docker (si ya configuraste el volumen NFS/SMB).
#
# Uso:
#   ./migrar-storage-a-nas.sh /mnt/nas/prisma/storage
#     (donde /mnt/nas/... es el punto de montaje del NAS en el HOST)
# ─────────────────────────────────────────────────────────────
set -euo pipefail

DESTINO="${1:-}"
VOLUMEN="${STORAGE_VOLUME:-odg_storage_pdfs}"   # nombre del volumen Docker actual

if [[ -z "$DESTINO" ]]; then
  echo "Uso: $0 <ruta-destino-del-NAS-en-el-host>"
  echo "Ej:  $0 /mnt/nas/prisma/storage"
  exit 1
fi

echo "Origen : volumen Docker '$VOLUMEN'"
echo "Destino: $DESTINO"
echo ""

# Verificar que el volumen exista
if ! docker volume inspect "$VOLUMEN" >/dev/null 2>&1; then
  echo "✗ No existe el volumen Docker '$VOLUMEN'. Ajustá STORAGE_VOLUME."
  exit 1
fi

mkdir -p "$DESTINO"

echo "Copiando archivos (preserva estructura y permisos)…"
docker run --rm \
  -v "${VOLUMEN}:/from:ro" \
  -v "${DESTINO}:/to" \
  alpine sh -c 'cp -av /from/. /to/ && echo "" && echo "Total en destino:" && du -sh /to'

echo ""
echo "✓ Copia terminada. Verificá el contenido en: $DESTINO"
echo "  Cuando confirmes que está todo, levantá la app con el override del NAS."
