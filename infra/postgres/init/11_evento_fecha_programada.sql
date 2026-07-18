-- =============================================================
-- MIGRACIÓN: Fecha programada en eventos
-- File: infra/postgres/init/11_evento_fecha_programada.sql
-- Idempotente: puede ejecutarse múltiples veces sin errores
-- =============================================================

-- Agregar columna fecha_programada a la tabla eventos
-- NULL permitido para compatibilidad con eventos existentes
ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS fecha_programada DATE;

-- =============================================================
-- FIN DEL SCRIPT
-- =============================================================
