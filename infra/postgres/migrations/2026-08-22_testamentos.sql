-- ─────────────────────────────────────────────────────────────
-- Búsqueda de testamentos
--
-- Un oficio de testamentos se resuelve en dos etapas con plazo fijo:
--
--   · 5 días hábiles para que las delegaciones seleccionadas busquen y
--     entreguen su información.
--   · 5 días hábiles más para que el encargado arme el proyecto de
--     contestación. En total, 10.
--
-- Los plazos NO se acortan si alguien responde antes: quien sigue puede
-- adelantarse, pero conserva sus días. Por eso las dos fechas se calculan y se
-- guardan al marcar el testamento, y no se recalculan después.
--
-- La búsqueda se opera con los delegatorios que ya existen; lo que se agrega es
-- el plazo por delegación, para saber cuántos días lleva cada una.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE oficios
  ADD COLUMN IF NOT EXISTS testamento                     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS testamento_en                  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS testamento_vence_delegaciones  DATE,
  ADD COLUMN IF NOT EXISTS testamento_vence_encargado     DATE;

COMMENT ON COLUMN oficios.testamento                    IS 'Oficio de búsqueda de testamentos: plazo fijo de 10 días hábiles en dos etapas';
COMMENT ON COLUMN oficios.testamento_en                 IS 'Cuándo se marcó: de aquí corren los plazos';
COMMENT ON COLUMN oficios.testamento_vence_delegaciones IS 'Límite de las delegaciones para entregar su búsqueda (5 días hábiles)';
COMMENT ON COLUMN oficios.testamento_vence_encargado    IS 'Límite del encargado para el proyecto de contestación (10 días hábiles)';

-- Plazo por delegación. Sirve para cualquier delegatorio, no solo los de
-- testamentos: si está vacío, ese delegatorio simplemente no tiene fecha límite.
ALTER TABLE oficio_delegatorios
  ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;

COMMENT ON COLUMN oficio_delegatorios.fecha_vencimiento IS 'Hasta cuándo tiene el área para contestar este delegatorio';
