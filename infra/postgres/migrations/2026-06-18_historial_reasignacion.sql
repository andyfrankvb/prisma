-- ─────────────────────────────────────────────────────────────
-- Registrar en el historial de la tarea cuando un director delega
-- (reasigna) la tarea a un integrante de su equipo.
-- Se amplía el CHECK del tipo para admitir 'REASIGNACION'.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE historial_revision_tarea DROP CONSTRAINT IF EXISTS historial_revision_tarea_tipo_check;

ALTER TABLE historial_revision_tarea ADD CONSTRAINT historial_revision_tarea_tipo_check
  CHECK (tipo::text = ANY (ARRAY[
    'AVANCE'::varchar,
    'DEVOLUCION'::varchar,
    'APROBACION_N1'::varchar,
    'APROBACION_N2'::varchar,
    'REASIGNACION'::varchar
  ]::text[]));
