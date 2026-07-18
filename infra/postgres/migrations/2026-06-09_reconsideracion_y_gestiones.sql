-- =============================================================
-- MIGRACIÓN: reconsideración de oficios + columnas de proyecto
-- Fecha: 2026-06-09
--
-- Cambios de oficialía aplicados en desarrollo que faltaban como
-- migración (de arreglos previos a esta sesión):
--   1. estatus_oficio: + EN_RECONSIDERACION
--   2. tabla comentarios_reconsideracion
--   3. gestiones_contestacion: + texto_proyecto, + version_proyecto
--
-- IDEMPOTENTE.
-- =============================================================

-- 1. Nuevo estatus de oficio para el ciclo de correcciones
ALTER TYPE estatus_oficio ADD VALUE IF NOT EXISTS 'EN_RECONSIDERACION';

-- 2. Comentarios de reconsideración (correcciones que pide el encargado)
CREATE TABLE IF NOT EXISTS comentarios_reconsideracion (
  id           SERIAL PRIMARY KEY,
  oficio_id    INTEGER NOT NULL REFERENCES oficios (id) ON DELETE CASCADE,
  encargado_id INTEGER NOT NULL REFERENCES usuarios (id),
  comentario   TEXT    NOT NULL,
  fecha        TIMESTAMP NOT NULL DEFAULT NOW(),
  version      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_coment_recon_oficio ON comentarios_reconsideracion (oficio_id);

-- 3. Columnas del proyecto de contestación
ALTER TABLE gestiones_contestacion
  ADD COLUMN IF NOT EXISTS texto_proyecto    TEXT,
  ADD COLUMN IF NOT EXISTS version_proyecto  INTEGER NOT NULL DEFAULT 1;

-- =============================================================
-- FIN DE LA MIGRACIÓN
-- =============================================================
