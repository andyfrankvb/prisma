-- ─────────────────────────────────────────────────────────────
-- Vía de recepción del oficio
--
-- Las autoridades no siempre entregan en ventanilla: varias mandan el oficio
-- por correo electrónico. Se registra por dónde entró y, cuando fue por correo,
-- de qué cuenta salió y a cuál llegó.
--
-- Los oficios ya capturados quedan como VENTANILLA: es como se venían
-- recibiendo antes de que existiera la opción.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE oficios
  ADD COLUMN IF NOT EXISTS via_recepcion  VARCHAR(30)  NOT NULL DEFAULT 'VENTANILLA',
  ADD COLUMN IF NOT EXISTS correo_origen  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS correo_destino VARCHAR(255);

ALTER TABLE oficios
  DROP CONSTRAINT IF EXISTS oficios_via_recepcion_check;

ALTER TABLE oficios
  ADD CONSTRAINT oficios_via_recepcion_check
  CHECK (via_recepcion IN ('VENTANILLA', 'CORREO_ELECTRONICO'));

COMMENT ON COLUMN oficios.via_recepcion  IS 'Por dónde entró el oficio: VENTANILLA o CORREO_ELECTRONICO';
COMMENT ON COLUMN oficios.correo_origen  IS 'Cuenta desde la que se envió (solo si via_recepcion = CORREO_ELECTRONICO)';
COMMENT ON COLUMN oficios.correo_destino IS 'Cuenta institucional que lo recibió (solo si via_recepcion = CORREO_ELECTRONICO)';
