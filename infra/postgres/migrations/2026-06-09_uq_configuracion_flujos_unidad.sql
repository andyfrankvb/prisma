-- =============================================================
-- MIGRACIÓN: restricción única para upsert de flujos por unidad
-- Fecha: 2026-06-09
--
-- El módulo de flujos del SuperAdmin hace:
--   ON CONFLICT (modulo_clave, rol_flujo, unidad_id) DO UPDATE ...
-- pero no existía una restricción única que coincidiera, provocando:
--   "there is no unique or exclusion constraint matching the ON CONFLICT"
--
-- Crea UNIQUE (modulo_clave, rol_flujo, unidad_id). PostgreSQL trata los
-- NULL como distintos (NULLS DISTINCT por defecto), así que las filas
-- antiguas con unidad_id NULL no chocan. Permite un actor por
-- (módulo, rol de flujo, unidad) — p. ej. un OFICIAL por delegación.
--
-- IDEMPOTENTE.
-- =============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_cfg_flujos_modulo_rol_unidad'
  ) THEN
    ALTER TABLE configuracion_flujos
      ADD CONSTRAINT uq_cfg_flujos_modulo_rol_unidad
      UNIQUE (modulo_clave, rol_flujo, unidad_id);
  END IF;
END $$;

-- =============================================================
-- FIN DE LA MIGRACIÓN
-- =============================================================
