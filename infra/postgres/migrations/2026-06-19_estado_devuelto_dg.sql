-- ─────────────────────────────────────────────────────────────
-- Nuevo estado DEVUELTO_DG para tareas de evento.
--
-- Flujo nuevo de devolución de la Dirección General:
--   EN_REVISION_DG --DG devuelve--> DEVUELTO_DG   (cae en el DIRECTOR de área)
--   DEVUELTO_DG    --director baja con observaciones--> DEVUELTO (cae en el OPERATIVO)
--   DEVUELTO       --operativo reenvía--> EN_REVISION
--
-- Antes la devolución de la DG saltaba directo al operativo.
-- NOTA: ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────

ALTER TYPE estado_tarea ADD VALUE IF NOT EXISTS 'DEVUELTO_DG';
