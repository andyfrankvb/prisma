-- =============================================================
-- MIGRACIÓN: columnas OCR en oficios
-- Fecha: 2026-06-09
--
-- Contexto: el servicio ocr.service.ts persiste el texto extraído
-- en oficios.texto_ocr (y ocr_procesado / ocr_fecha / ocr_metodo),
-- pero estas columnas no existían en la BD (el init script
-- 05_catalogo_unidades.sql solo corre al crear el volumen).
-- Resultado: el UPDATE del OCR fallaba en silencio y el texto se perdía.
--
-- IDEMPOTENTE.
-- =============================================================

ALTER TABLE oficios
    ADD COLUMN IF NOT EXISTS texto_ocr     TEXT,
    ADD COLUMN IF NOT EXISTS ocr_procesado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ocr_fecha     TIMESTAMP,
    ADD COLUMN IF NOT EXISTS ocr_metodo    VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_oficios_ocr_procesado ON oficios (ocr_procesado);

-- =============================================================
-- FIN DE LA MIGRACIÓN
-- =============================================================
