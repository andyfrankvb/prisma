#!/bin/sh
# ─────────────────────────────────────────────────────────────
# Backup Script: Daily PostgreSQL dump + optional S3 upload
# File: infra/scripts/backup.sh
#
# Runs inside the db_backup container.
# Schedule: cron 0 2 * * * (02:00 daily)
#
# Outputs:
#   /backups/db/YYYY-MM-DD_HH-MM-SS.sql.gz
#   Optionally uploaded to S3_BUCKET
# ─────────────────────────────────────────────────────────────

set -e

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="/backups/db"
BACKUP_FILE="${BACKUP_DIR}/${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Starting DB dump at ${TIMESTAMP}"

# ── PostgreSQL dump ───────────────────────────────────────────
pg_dump \
  -h db_prod \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip -9 > "${BACKUP_FILE}"

DUMP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[backup] Dump complete: ${BACKUP_FILE} (${DUMP_SIZE})"

# ── Upload to S3 (optional) ───────────────────────────────────
if [ -n "${S3_BUCKET}" ] && [ -n "${AWS_ACCESS_KEY_ID}" ]; then
  echo "[backup] Uploading to s3://${S3_BUCKET}/db/${TIMESTAMP}.sql.gz"

  # Use AWS CLI if available, otherwise use curl with presigned URL
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/db/${TIMESTAMP}.sql.gz" \
      --storage-class STANDARD_IA \
      --quiet
    echo "[backup] S3 upload complete"
  else
    echo "[backup] WARNING: aws CLI not found, skipping S3 upload"
  fi
fi

# ── Prune old local backups ───────────────────────────────────
echo "[backup] Pruning backups older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -name "*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

REMAINING=$(ls -1 "${BACKUP_DIR}" | wc -l)
echo "[backup] Done. ${REMAINING} backup(s) retained in ${BACKUP_DIR}"
