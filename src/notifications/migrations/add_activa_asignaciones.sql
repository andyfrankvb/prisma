-- Migration: add activa column to asignaciones_juridicas
-- Allows tracking which assignment is currently active when reassignments occur.

ALTER TABLE asignaciones_juridicas
  ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT TRUE;

-- Mark only the latest assignment per oficio as active (for existing data)
UPDATE asignaciones_juridicas aj
SET activa = FALSE
WHERE id NOT IN (
  SELECT DISTINCT ON (oficio_id) id
  FROM asignaciones_juridicas
  ORDER BY oficio_id, fecha_asignacion DESC
);
