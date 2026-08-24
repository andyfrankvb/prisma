-- ─────────────────────────────────────────────────────────────
-- Devolver lo que se turnó o se delegó por error
--
-- Un área puede recibir un oficio turnado —o un delegatorio— que no le compete.
-- Antes solo podía responderlo; ahora puede regresarlo a quien lo detonó,
-- siempre con una justificación.
--
--   · Turno: se registra el movimiento inverso en `oficio_turnos`, marcado como
--     devolución para distinguirlo en la línea de tiempo.
--   · Delegatorio: estado nuevo RECHAZADO. No cuenta como pendiente, así que un
--     delegatorio rechazado deja de bloquear el visto bueno y la firma.
--
-- Responder con documento y observación sigue existiendo: son dos caminos,
-- el área elige según el caso.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE oficio_turnos
  ADD COLUMN IF NOT EXISTS es_devolucion BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN oficio_turnos.es_devolucion IS
  'El área regresó el oficio a quien se lo turnó, por no ser de su competencia';

ALTER TABLE oficio_delegatorios
  DROP CONSTRAINT IF EXISTS delegatorio_estado_chk;

ALTER TABLE oficio_delegatorios
  ADD CONSTRAINT delegatorio_estado_chk
  CHECK (estado IN ('PENDIENTE', 'ASIGNADO', 'EN_REVISION', 'CONTESTADO', 'RECHAZADO'));
