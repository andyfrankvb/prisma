-- ─────────────────────────────────────────────────────────────
-- Incorporación de FRE a SIQROO
--
-- Se marca cuando el folio real electrónico ya quedó incorporado en SIQROO.
-- Es una constancia, no una etapa del flujo: no bloquea nada ni cambia el
-- estatus del oficio. Se guarda la fecha para saber cuándo se hizo.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE oficios
  ADD COLUMN IF NOT EXISTS fre_incorporado    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fre_incorporado_en TIMESTAMP;

COMMENT ON COLUMN oficios.fre_incorporado    IS 'El FRE ya se incorporó a SIQROO';
COMMENT ON COLUMN oficios.fre_incorporado_en IS 'Cuándo se marcó la incorporación del FRE';
