-- ─────────────────────────────────────────────────────────────
-- Registro del oficio en SIGER, además de SIQROO
--
-- Una misma solicitud puede capturarse en SIQROO, en SIGER, en los dos o en
-- ninguno. Son independientes: cada sistema lleva su propio número de control
-- interno (NCI), igual que ya lo hacía SIQROO.
--
-- Los oficios existentes quedan con SIGER en falso: hasta hoy solo se llevaba
-- el registro de SIQROO.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE oficios
  ADD COLUMN IF NOT EXISTS siger_aplica          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS siger_control_interno VARCHAR(255);

COMMENT ON COLUMN oficios.siger_aplica          IS 'La solicitud se ingresó también en SIGER';
COMMENT ON COLUMN oficios.siger_control_interno IS 'Número de control interno (NCI) en SIGER';
