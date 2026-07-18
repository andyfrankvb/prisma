-- =============================================================
-- MIGRACIÓN: director responsable de evento
-- Fecha: 2026-06-09
--
-- Permite que la Directora General designe a un director de área
-- como responsable/coordinador de un evento. El responsable puede
-- ver todas las actividades del evento y asignar a otros directores.
--
-- IDEMPOTENTE.
-- =============================================================

ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS responsable_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eventos_responsable_id_fkey'
  ) THEN
    ALTER TABLE eventos
      ADD CONSTRAINT eventos_responsable_id_fkey
      FOREIGN KEY (responsable_id) REFERENCES usuarios (id)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_eventos_responsable ON eventos (responsable_id);

-- =============================================================
-- FIN DE LA MIGRACIÓN
-- =============================================================
