-- =============================================================
-- MIGRACIÓN: Flujo de Revisión de Tareas de Eventos
-- File: infra/postgres/init/09_flujo_revision_tareas.sql
-- Idempotente: puede ejecutarse múltiples veces sin errores
-- =============================================================

-- -------------------------------------------------------------
-- 1. Extender enum estado_tarea con los nuevos valores
--    IF NOT EXISTS garantiza idempotencia
-- -------------------------------------------------------------

ALTER TYPE estado_tarea ADD VALUE IF NOT EXISTS 'EN_REVISION';
ALTER TYPE estado_tarea ADD VALUE IF NOT EXISTS 'DEVUELTO';

-- -------------------------------------------------------------
-- 2. TABLA: historial_revision_tarea
--    Registro append-only de avances y devoluciones por tarea
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS historial_revision_tarea (
    id            SERIAL      PRIMARY KEY,
    tarea_id      INTEGER     NOT NULL
                      REFERENCES tareas_evento (id)
                      ON UPDATE CASCADE
                      ON DELETE CASCADE,
    autor_id      INTEGER     NOT NULL
                      REFERENCES usuarios (id)
                      ON UPDATE CASCADE
                      ON DELETE RESTRICT,
    tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('AVANCE', 'DEVOLUCION')),
    contenido     TEXT,
    documento_url TEXT,
    creado_en     TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historial_rev_tarea ON historial_revision_tarea (tarea_id);
CREATE INDEX IF NOT EXISTS idx_historial_rev_autor ON historial_revision_tarea (autor_id);
CREATE INDEX IF NOT EXISTS idx_historial_rev_fecha ON historial_revision_tarea (creado_en DESC);

-- =============================================================
-- FIN DEL SCRIPT
-- =============================================================
