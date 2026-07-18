-- =============================================================
-- MIGRACIÓN: Módulos de Supervisión y Director
-- File: infra/postgres/init/04_modulos_supervision.sql
-- =============================================================

-- -------------------------------------------------------------
-- 1. Extender enum rol_usuario con SUPERADMIN
-- -------------------------------------------------------------

ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'SUPERADMIN';

-- -------------------------------------------------------------
-- 2. Agregar columna activo a usuarios (soft-delete)
-- -------------------------------------------------------------

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- -------------------------------------------------------------
-- 3. TABLA: modulos
--    Catálogo de módulos funcionales del sistema
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS modulos (
    id             SERIAL       PRIMARY KEY,
    clave          VARCHAR(100) NOT NULL UNIQUE,
    nombre_display VARCHAR(150) NOT NULL,
    descripcion    TEXT,
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    orden          INTEGER      NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_modulos_clave  ON modulos (clave);
CREATE INDEX IF NOT EXISTS idx_modulos_activo ON modulos (activo);

-- -------------------------------------------------------------
-- 4. TABLA: usuario_modulos
--    Asignaciones de módulos a usuarios (muchos a muchos)
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usuario_modulos (
    usuario_id      INTEGER   NOT NULL
                        REFERENCES usuarios (id)
                        ON UPDATE CASCADE
                        ON DELETE CASCADE,
    modulo_id       INTEGER   NOT NULL
                        REFERENCES modulos (id)
                        ON UPDATE CASCADE
                        ON DELETE RESTRICT,
    asignado_en     TIMESTAMP NOT NULL DEFAULT NOW(),
    asignado_por_id INTEGER   NOT NULL
                        REFERENCES usuarios (id)
                        ON UPDATE CASCADE
                        ON DELETE RESTRICT,
    PRIMARY KEY (usuario_id, modulo_id)
);

CREATE INDEX IF NOT EXISTS idx_usuario_modulos_usuario ON usuario_modulos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_modulos_modulo  ON usuario_modulos (modulo_id);

-- -------------------------------------------------------------
-- 5. ENUM + TABLA: eventos
--    Eventos operativos creados por la Directora General
-- -------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE estado_evento AS ENUM ('ABIERTO', 'CERRADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS eventos (
    id             SERIAL        PRIMARY KEY,
    titulo         VARCHAR(255)  NOT NULL,
    descripcion    TEXT,
    estado         estado_evento NOT NULL DEFAULT 'ABIERTO',
    creado_por_id  INTEGER       NOT NULL
                       REFERENCES usuarios (id)
                       ON UPDATE CASCADE
                       ON DELETE RESTRICT,
    fecha_creacion TIMESTAMP     NOT NULL DEFAULT NOW(),
    fecha_cierre   TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eventos_estado         ON eventos (estado);
CREATE INDEX IF NOT EXISTS idx_eventos_creado_por     ON eventos (creado_por_id);
CREATE INDEX IF NOT EXISTS idx_eventos_fecha_creacion ON eventos (fecha_creacion DESC);

-- -------------------------------------------------------------
-- 6. ENUM + TABLA: tareas_evento
--    Tareas asociadas a eventos, asignadas a directores de área
-- -------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE estado_tarea AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tareas_evento (
    id                  SERIAL       PRIMARY KEY,
    evento_id           INTEGER      NOT NULL
                            REFERENCES eventos (id)
                            ON UPDATE CASCADE
                            ON DELETE CASCADE,
    titulo              VARCHAR(255) NOT NULL,
    descripcion         TEXT,
    asignado_a_id       INTEGER      NOT NULL
                            REFERENCES usuarios (id)
                            ON UPDATE CASCADE
                            ON DELETE RESTRICT,
    estado              estado_tarea NOT NULL DEFAULT 'PENDIENTE',
    fecha_programada    DATE         NOT NULL,
    fecha_actualizacion TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tareas_evento_evento     ON tareas_evento (evento_id);
CREATE INDEX IF NOT EXISTS idx_tareas_evento_asignado   ON tareas_evento (asignado_a_id);
CREATE INDEX IF NOT EXISTS idx_tareas_evento_estado     ON tareas_evento (estado);
CREATE INDEX IF NOT EXISTS idx_tareas_evento_fecha_prog ON tareas_evento (fecha_programada);

-- =============================================================
-- FIN DEL SCRIPT
-- =============================================================

-- -------------------------------------------------------------
-- 7. TABLA: comentarios_tarea
--    Comentarios de avance del director asignado a una tarea
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS comentarios_tarea (
    id           SERIAL      PRIMARY KEY,
    tarea_id     INTEGER     NOT NULL
                     REFERENCES tareas_evento (id)
                     ON UPDATE CASCADE
                     ON DELETE CASCADE,
    autor_id     INTEGER     NOT NULL
                     REFERENCES usuarios (id)
                     ON UPDATE CASCADE
                     ON DELETE RESTRICT,
    contenido    TEXT        NOT NULL,
    creado_en    TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_tarea_tarea  ON comentarios_tarea (tarea_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_tarea_autor  ON comentarios_tarea (autor_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_tarea_fecha  ON comentarios_tarea (creado_en DESC);

-- -------------------------------------------------------------
-- 8. Agregar fecha_compromiso a tareas_evento
--    La establece el Director de Área (su compromiso de entrega)
-- -------------------------------------------------------------

ALTER TABLE tareas_evento
    ADD COLUMN IF NOT EXISTS fecha_compromiso DATE;

CREATE INDEX IF NOT EXISTS idx_tareas_evento_fecha_comp ON tareas_evento (fecha_compromiso);

-- -------------------------------------------------------------
-- 9. Agregar rol OPERATIVO al enum rol_usuario
-- -------------------------------------------------------------

ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'OPERATIVO';

-- -------------------------------------------------------------
-- 10. Agregar reasignado_a_id a tareas_evento
--     El Director de Área puede reasignar la tarea a un operativo
-- -------------------------------------------------------------

ALTER TABLE tareas_evento
    ADD COLUMN IF NOT EXISTS reasignado_a_id INTEGER
        REFERENCES usuarios (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tareas_evento_reasignado ON tareas_evento (reasignado_a_id);
