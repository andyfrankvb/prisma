-- =============================================================
-- MIGRACIÓN: agregar unidad_id a configuracion_flujos
-- Fecha: 2026-06-08
--
-- Contexto: producción se inicializó con una versión del esquema
-- (08_configuracion_flujos.sql) que NO incluía la columna unidad_id.
-- El backend (getMisRolesFlujo y el módulo de flujos del SuperAdmin)
-- la consulta, provocando: column cf.unidad_id does not exist.
--
-- Esta migración es IDEMPOTENTE: se puede correr varias veces sin error.
-- =============================================================

-- 1. Columna unidad_id (nullable, igual que en desarrollo)
ALTER TABLE configuracion_flujos
  ADD COLUMN IF NOT EXISTS unidad_id INTEGER;

-- 2. Foreign key → catalogo_unidades (PostgreSQL no soporta IF NOT EXISTS
--    en ADD CONSTRAINT, por eso se usa un bloque condicional)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'configuracion_flujos_unidad_id_fkey'
  ) THEN
    ALTER TABLE configuracion_flujos
      ADD CONSTRAINT configuracion_flujos_unidad_id_fkey
      FOREIGN KEY (unidad_id) REFERENCES catalogo_unidades (id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

-- 3. Índice sobre unidad_id
CREATE INDEX IF NOT EXISTS idx_cfg_flujos_unidad_id
  ON configuracion_flujos (unidad_id);

-- 4. Eliminar la restricción UNIQUE antigua (modulo_clave, rol_flujo)
--    si existe. El flujo actual permite varios actores con el mismo
--    rol_flujo (p. ej. varios OFICIAL en distintas delegaciones),
--    por eso en desarrollo esta restricción ya no existe.
ALTER TABLE configuracion_flujos
  DROP CONSTRAINT IF EXISTS uq_configuracion_flujos;

-- =============================================================
-- FIN DE LA MIGRACIÓN
-- =============================================================
