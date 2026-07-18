-- =============================================================
-- MÓDULO: OFICIALÍA DE PARTES
-- Script: modulo_oficialia_partes.sql
-- Generado: 2026-04-23
-- =============================================================

-- -------------------------------------------------------------
-- TIPOS ENUM
-- -------------------------------------------------------------

CREATE TYPE rol_usuario AS ENUM (
    'OFICIAL',
    'ENCARGADO',
    'JURIDICO',
    'SECRETARIA',
    'DIRECTOR'
);

CREATE TYPE estatus_oficio AS ENUM (
    'RECIBIDO',
    'ASIGNADO',
    'EN_REVISION',
    'VOBO_APROBADO',
    'FINALIZADO'
);

-- -------------------------------------------------------------
-- TABLA: catalogo_oficinas
-- -------------------------------------------------------------

CREATE TABLE catalogo_oficinas (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(100) NOT NULL
                CHECK (nombre IN ('Chetumal', 'Cancun', 'Playa', 'Cozumel', 'Direccion General')),
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

-- -------------------------------------------------------------
-- TABLA: usuarios
-- -------------------------------------------------------------

CREATE TABLE usuarios (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(150) NOT NULL,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    rol            rol_usuario  NOT NULL,
    oficina_id     INTEGER      NOT NULL
                       REFERENCES catalogo_oficinas (id)
                       ON UPDATE CASCADE
                       ON DELETE RESTRICT
);

-- -------------------------------------------------------------
-- TABLA: oficios
-- -------------------------------------------------------------

CREATE TABLE oficios (
    id                    SERIAL PRIMARY KEY,
    folio                 VARCHAR(100)        NOT NULL UNIQUE,
    remitente             VARCHAR(255)        NOT NULL,
    dependencia_origen    VARCHAR(255)        NOT NULL,
    dirigido_a_id         INTEGER             NOT NULL
                              REFERENCES usuarios (id)
                              ON UPDATE CASCADE
                              ON DELETE RESTRICT,
    oficial_registro_id   INTEGER             NOT NULL
                              REFERENCES usuarios (id)
                              ON UPDATE CASCADE
                              ON DELETE RESTRICT,
    oficina_registro_id   INTEGER             NOT NULL
                              REFERENCES catalogo_oficinas (id)
                              ON UPDATE CASCADE
                              ON DELETE RESTRICT,
    fecha_registro        TIMESTAMP           NOT NULL DEFAULT NOW(),
    descripcion_solicitud TEXT                NOT NULL,
    tiene_termino         BOOLEAN             NOT NULL DEFAULT FALSE,
    fecha_vencimiento     DATE,
    pdf_original_path     VARCHAR(500)        NOT NULL,
    estatus               estatus_oficio      NOT NULL DEFAULT 'RECIBIDO'
);

-- Índices de oficios
CREATE INDEX idx_oficios_folio             ON oficios (folio);
CREATE INDEX idx_oficios_fecha_vencimiento ON oficios (fecha_vencimiento);
CREATE INDEX idx_oficios_estatus           ON oficios (estatus);

-- -------------------------------------------------------------
-- TABLA: asignaciones_juridicas
-- -------------------------------------------------------------

CREATE TABLE asignaciones_juridicas (
    id               SERIAL PRIMARY KEY,
    oficio_id        INTEGER   NOT NULL
                         REFERENCES oficios (id)
                         ON UPDATE CASCADE
                         ON DELETE CASCADE,
    abogado_id       INTEGER   NOT NULL
                         REFERENCES usuarios (id)
                         ON UPDATE CASCADE
                         ON DELETE RESTRICT,
    asignado_por_id  INTEGER   NOT NULL
                         REFERENCES usuarios (id)
                         ON UPDATE CASCADE
                         ON DELETE RESTRICT,
    fecha_asignacion TIMESTAMP NOT NULL DEFAULT NOW(),
    observaciones    TEXT
);

-- -------------------------------------------------------------
-- TABLA: gestiones_contestacion
-- -------------------------------------------------------------

CREATE TABLE gestiones_contestacion (
    id                        SERIAL PRIMARY KEY,
    oficio_id                 INTEGER     NOT NULL
                                  REFERENCES oficios (id)
                                  ON UPDATE CASCADE
                                  ON DELETE CASCADE,
    proyecto_url              VARCHAR(500) NOT NULL,
    escaneo_firmado_url       VARCHAR(500),
    vobo_encargado            BOOLEAN      NOT NULL DEFAULT FALSE,
    fecha_vobo                TIMESTAMP,
    subido_por_secretaria_id  INTEGER
                                  REFERENCES usuarios (id)
                                  ON UPDATE CASCADE
                                  ON DELETE SET NULL
);

-- -------------------------------------------------------------
-- TABLA: auditoria_estados
-- -------------------------------------------------------------

CREATE TABLE auditoria_estados (
    id              SERIAL PRIMARY KEY,
    oficio_id       INTEGER        NOT NULL
                        REFERENCES oficios (id)
                        ON UPDATE CASCADE
                        ON DELETE CASCADE,
    estado_anterior estatus_oficio,
    estado_nuevo    estatus_oficio NOT NULL,
    usuario_id      INTEGER        NOT NULL
                        REFERENCES usuarios (id)
                        ON UPDATE CASCADE
                        ON DELETE RESTRICT,
    fecha_cambio    TIMESTAMP      NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- DATOS SEMILLA: catalogo_oficinas
-- -------------------------------------------------------------

INSERT INTO catalogo_oficinas (nombre, activo) VALUES
    ('Chetumal',          TRUE),
    ('Cancun',            TRUE),
    ('Playa',             TRUE),
    ('Cozumel',           TRUE),
    ('Direccion General', TRUE);

-- -------------------------------------------------------------
-- TABLA: comentarios_reconsideracion
-- Comentarios del encargado al rechazar un borrador jurídico.
-- El abogado los lee, corrige su proyecto y vuelve a subirlo.
-- -------------------------------------------------------------

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

-- =============================================================
-- FIN DEL SCRIPT
-- =============================================================
