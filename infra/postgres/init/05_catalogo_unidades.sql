-- =============================================================
-- SCRIPT: 05_catalogo_unidades.sql
-- Aplica columnas adicionales que no están en 00_schema.sql.
-- Diseñado para ser idempotente (IF NOT EXISTS / IF EXISTS).
-- =============================================================

-- 1. Columna activa en asignaciones_juridicas
--    Permite rastrear cuál asignación está vigente tras reasignaciones.
ALTER TABLE asignaciones_juridicas
    ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Columnas OCR en oficios
ALTER TABLE oficios
    ADD COLUMN IF NOT EXISTS texto_ocr     TEXT,
    ADD COLUMN IF NOT EXISTS ocr_procesado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ocr_fecha     TIMESTAMP,
    ADD COLUMN IF NOT EXISTS ocr_metodo    VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_oficios_ocr_procesado ON oficios (ocr_procesado);

-- 3. Columnas de gestión de proyectos (versioning + texto extraído)
ALTER TABLE gestiones_contestacion
    ADD COLUMN IF NOT EXISTS version_proyecto INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS texto_proyecto   TEXT;

-- 4. Columnas de reconsideración en gestiones_contestacion
--    (comentarios se guardan en tabla separada, pero vobo_encargado ya existe)

-- 5. TABLA: comentarios_reconsideracion
--    Comentarios del encargado al rechazar un borrador.
CREATE TABLE IF NOT EXISTS comentarios_reconsideracion (
    id           SERIAL    PRIMARY KEY,
    oficio_id    INTEGER   NOT NULL
                     REFERENCES oficios (id)
                     ON UPDATE CASCADE
                     ON DELETE CASCADE,
    encargado_id INTEGER   NOT NULL
                     REFERENCES usuarios (id)
                     ON UPDATE CASCADE
                     ON DELETE RESTRICT,
    comentario   TEXT      NOT NULL,
    fecha        TIMESTAMP NOT NULL DEFAULT NOW(),
    version      INTEGER   NOT NULL DEFAULT 1,
    resuelto     BOOLEAN   NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_comentarios_recons_oficio ON comentarios_reconsideracion (oficio_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_recons_fecha  ON comentarios_reconsideracion (fecha DESC);

-- 6. Agregar EN_RECONSIDERACION al enum estatus_oficio si no existe
--    (el 00_schema.sql no lo incluye pero el código lo usa)
ALTER TYPE estatus_oficio ADD VALUE IF NOT EXISTS 'EN_RECONSIDERACION';

-- =============================================================
-- FIN DEL SCRIPT
-- =============================================================
