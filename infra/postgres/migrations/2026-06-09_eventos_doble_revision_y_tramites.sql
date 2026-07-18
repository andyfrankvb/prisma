-- =============================================================
-- MIGRACIÓN: flujo de doble revisión en eventos + comentarios en trámites
-- Fecha: 2026-06-09
--
-- Cambios aplicados en desarrollo que faltaban como migración:
--   1. Enum estado_tarea: + EN_REVISION_DG, + FINALIZADO
--   2. historial_revision_tarea: + columna nivel_revision
--   3. historial_revision_tarea_tipo_check: permitir APROBACION_N1 / APROBACION_N2
--   4. tramites: + columna comentarios
--
-- NOTA: los ALTER TYPE de enums deben ejecutarse fuera de una transacción.
--       Corre este archivo con psql normal (no dentro de BEGIN/COMMIT manual).
-- IDEMPOTENTE.
-- =============================================================

-- 1. Nuevos estados del enum estado_tarea
ALTER TYPE estado_tarea ADD VALUE IF NOT EXISTS 'EN_REVISION_DG' AFTER 'EN_REVISION';
ALTER TYPE estado_tarea ADD VALUE IF NOT EXISTS 'FINALIZADO'     AFTER 'EN_REVISION_DG';

-- 2. Columna nivel_revision en el historial de revisión
ALTER TABLE historial_revision_tarea
  ADD COLUMN IF NOT EXISTS nivel_revision INTEGER NOT NULL DEFAULT 1;

-- 3. Actualizar el CHECK de tipo para incluir las aprobaciones de nivel 1 y 2
ALTER TABLE historial_revision_tarea
  DROP CONSTRAINT IF EXISTS historial_revision_tarea_tipo_check;
ALTER TABLE historial_revision_tarea
  ADD CONSTRAINT historial_revision_tarea_tipo_check
  CHECK (tipo IN ('AVANCE','DEVOLUCION','APROBACION_N1','APROBACION_N2'));

-- 4. Columna comentarios en trámites
ALTER TABLE tramites
  ADD COLUMN IF NOT EXISTS comentarios TEXT;

-- =============================================================
-- FIN DE LA MIGRACIÓN
-- =============================================================
