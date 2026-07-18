-- ============================================================
-- MIGRACIÓN: Revisión de Doble Nivel en Tareas de Eventos
-- File: infra/postgres/init/10_revision_doble_nivel.sql
-- Idempotente: puede ejecutarse múltiples veces sin errores
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nuevo valor en el enum estado_tarea
--    IF NOT EXISTS garantiza idempotencia
-- ------------------------------------------------------------

ALTER TYPE estado_tarea ADD VALUE IF NOT EXISTS 'EN_REVISION_DG';

-- ------------------------------------------------------------
-- 2. Columna nivel_revision en historial_revision_tarea
--    DEFAULT 1 garantiza que los registros existentes reciban nivel 1
-- ------------------------------------------------------------

ALTER TABLE historial_revision_tarea
  ADD COLUMN IF NOT EXISTS nivel_revision SMALLINT NOT NULL DEFAULT 1;

-- ------------------------------------------------------------
-- 3. Extender el CHECK constraint de la columna tipo
--    PostgreSQL no soporta ALTER CONSTRAINT directamente;
--    se elimina el viejo y se crea el nuevo de forma idempotente.
-- ------------------------------------------------------------

DO $$
BEGIN
  -- Eliminar constraint existente si existe (cualquier nombre que contenga 'tipo')
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'historial_revision_tarea'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%tipo%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE historial_revision_tarea DROP CONSTRAINT ' || quote_ident(constraint_name)
      FROM information_schema.table_constraints
      WHERE table_name = 'historial_revision_tarea'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%tipo%'
      LIMIT 1
    );
  END IF;

  -- Agregar nuevo constraint con todos los valores válidos
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'historial_revision_tarea'
      AND constraint_name = 'historial_revision_tarea_tipo_check_v2'
  ) THEN
    ALTER TABLE historial_revision_tarea
      ADD CONSTRAINT historial_revision_tarea_tipo_check_v2
      CHECK (tipo IN ('AVANCE', 'DEVOLUCION', 'APROBACION_N1', 'APROBACION_N2'));
  END IF;
END;
$$;

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================
