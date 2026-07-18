-- =============================================================
-- MIGRACIÓN: eventos de director sin aprobación de la DG
-- Fecha: 2026-06-10
--
-- Distingue dos tipos de evento:
--   · requiere_aprobacion_dg = true  → evento de la Directora General
--     (flujo actual: operativo → director N1 → DG N2 → FINALIZADO)
--   · requiere_aprobacion_dg = false → evento creado por un director de área
--     (flujo corto: operativo → director aprueba → FINALIZADO; privado, sin DG)
--
-- IDEMPOTENTE. Los eventos existentes quedan con true (comportamiento actual).
-- =============================================================

ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS requiere_aprobacion_dg BOOLEAN NOT NULL DEFAULT true;

-- =============================================================
-- FIN DE LA MIGRACIÓN
-- =============================================================
