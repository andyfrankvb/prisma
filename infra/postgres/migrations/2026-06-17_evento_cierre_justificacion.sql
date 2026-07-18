-- ─────────────────────────────────────────────────────────────
-- Cierre manual de eventos con justificación
--   · justificacion_cierre: motivo/registro del cierre (obligatorio en la API)
--   · cerrado_por_id:       usuario que cerró el evento (para el registro)
-- El auto-cierre automático se elimina en el código; los eventos ahora se
-- cierran manualmente con justificación.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE eventos ADD COLUMN IF NOT EXISTS justificacion_cierre TEXT;
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS cerrado_por_id       INTEGER REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;
