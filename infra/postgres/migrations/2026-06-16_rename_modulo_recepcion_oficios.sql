-- ─────────────────────────────────────────────────────────────
-- Rename del módulo: "Oficialía de Partes" → "Recepción de Oficios"
-- La clave interna (oficialia_partes) NO cambia para no romper
-- referencias en código, flujos ni asignaciones existentes.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────

UPDATE modulos
   SET nombre_display = 'Recepción de Oficios'
 WHERE clave = 'oficialia_partes';
