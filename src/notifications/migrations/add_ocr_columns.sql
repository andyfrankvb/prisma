-- Migration: add OCR columns to oficios
-- File: src/notifications/migrations/add_ocr_columns.sql

ALTER TABLE oficios
  ADD COLUMN IF NOT EXISTS texto_ocr     TEXT,
  ADD COLUMN IF NOT EXISTS ocr_procesado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ocr_fecha     TIMESTAMP,
  ADD COLUMN IF NOT EXISTS ocr_metodo    VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_oficios_ocr_procesado ON oficios (ocr_procesado);
