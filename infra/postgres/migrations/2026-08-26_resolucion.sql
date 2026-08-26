-- Marca de «Resolución».
--
-- Hay asuntos que llegan dirigidos a una delegación pero que resuelve la
-- Dirección General: la delegación avanza lo que le toca y desde ahí se los
-- manda. Marcarlos permite distinguirlos después —cuántos hubo, de qué
-- delegación salieron— sin tener que deducirlo del texto del oficio.
--
-- No trae plazos propios: es una clasificación, no un flujo aparte. El envío en
-- sí usa el mismo mecanismo que cualquier otro envío de información entre áreas,
-- con su documento y su justificación; la casilla solo es el atajo que fija el
-- destino y deja constancia de que se trató de una resolución.

ALTER TABLE oficios
  ADD COLUMN IF NOT EXISTS resolucion    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolucion_en timestamptz;

CREATE INDEX IF NOT EXISTS ix_oficios_resolucion
  ON oficios (resolucion) WHERE resolucion;
