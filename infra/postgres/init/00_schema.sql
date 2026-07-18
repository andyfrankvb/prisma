-- =============================================================
-- MÓDULO: OFICIALÍA DE PARTES
-- Script: 00_schema.sql
-- =============================================================

-- -------------------------------------------------------------
-- TIPOS ENUM
-- -------------------------------------------------------------

CREATE TYPE rol_usuario AS ENUM (
    'OFICIAL',
    'ENCARGADO',
    'JURIDICO',
    'SECRETARIA',
    'DIRECTOR',
    'SUPERADMIN',
    'OPERATIVO'
);

CREATE TYPE estatus_oficio AS ENUM (
    'RECIBIDO',
    'ASIGNADO',
    'EN_REVISION',
    'VOBO_APROBADO',
    'FINALIZADO'
);

CREATE TYPE tipo_unidad AS ENUM (
    'DIRECCION_GENERAL',
    'DIRECCION',
    'DELEGACION'
);

-- -------------------------------------------------------------
-- TABLA: catalogo_unidades
-- -------------------------------------------------------------

CREATE TABLE catalogo_unidades (
    id      SERIAL       PRIMARY KEY,
    nombre  VARCHAR(150) NOT NULL,
    tipo    tipo_unidad  NOT NULL,
    clave   VARCHAR(50)  NOT NULL UNIQUE,
    activo  BOOLEAN      NOT NULL DEFAULT TRUE
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
    unidad_id      INTEGER      NOT NULL
                       REFERENCES catalogo_unidades (id)
                       ON UPDATE CASCADE
                       ON DELETE RESTRICT,
    activo         BOOLEAN      NOT NULL DEFAULT TRUE
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
    unidad_registro_id    INTEGER             NOT NULL
                              REFERENCES catalogo_unidades (id)
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
-- DATOS SEMILLA: catalogo_unidades
-- -------------------------------------------------------------

INSERT INTO catalogo_unidades (nombre, tipo, clave, activo) VALUES
    ('Dirección General',                              'DIRECCION_GENERAL', 'dir_general',  TRUE),
    ('Dirección de Innovación, Informática y Archivo', 'DIRECCION',         'dir_tics',     TRUE),
    ('Dirección Jurídica',                             'DIRECCION',         'dir_juridica', TRUE),
    ('Delegación Othón P. Blanco',                     'DELEGACION',        'del_opb',      TRUE),
    ('Delegación Benito Juárez',                       'DELEGACION',        'del_bj',       TRUE),
    ('Delegación Playa del Carmen',                    'DELEGACION',        'del_playa',    TRUE),
    ('Delegación Cozumel',                             'DELEGACION',        'del_cozumel',  TRUE);

-- =============================================================
-- FIN DEL SCRIPT
-- =============================================================
