-- =============================================================
-- MÓDULO: SEGUIMIENTO DE TRÁMITES
-- Script: 06_tramites_seguimiento.sql
-- Idempotente: usa IF NOT EXISTS / DO $$ ... END $$
-- =============================================================

-- 1. Enum estatus_tramite
DO $$ BEGIN
  CREATE TYPE estatus_tramite AS ENUM (
    'NUEVO', 'EN_REVISION', 'EN_PROCESO', 'FINALIZADO', 'RECHAZADO',
    'DEVUELTO_DELEGADO', 'DEVUELTO_JURIDICO'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tabla tramites
CREATE TABLE IF NOT EXISTS tramites (
  id                      SERIAL PRIMARY KEY,
  folio                   VARCHAR(100)     NOT NULL UNIQUE,
  numero_ticket           VARCHAR(100)     NOT NULL,
  titulo                  VARCHAR(255)     NOT NULL,
  descripcion             TEXT             NOT NULL,
  tipo_tramite            VARCHAR(100)     NOT NULL,
  nombre_solicitante      VARCHAR(255)     NOT NULL,
  correo_solicitante      VARCHAR(255)     NOT NULL,
  telefono_solicitante    VARCHAR(50)      NOT NULL,
  checklist_documentacion BOOLEAN          NOT NULL DEFAULT FALSE,
  checklist_proyecto      BOOLEAN          NOT NULL DEFAULT FALSE,
  estatus                 estatus_tramite  NOT NULL DEFAULT 'NUEVO',
  unidad_creadora_id      INTEGER          NOT NULL
                              REFERENCES catalogo_unidades(id)
                              ON UPDATE CASCADE ON DELETE RESTRICT,
  creado_por_id           INTEGER          NOT NULL
                              REFERENCES usuarios(id)
                              ON UPDATE CASCADE ON DELETE RESTRICT,
  fecha_creacion          TIMESTAMP        NOT NULL DEFAULT NOW(),
  fecha_registro          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  fecha_compromiso        DATE,
  fecha_cierre            TIMESTAMPTZ      NULL
);

CREATE INDEX IF NOT EXISTS idx_tramites_folio            ON tramites (folio);
CREATE INDEX IF NOT EXISTS idx_tramites_estatus          ON tramites (estatus);
CREATE INDEX IF NOT EXISTS idx_tramites_unidad_creadora  ON tramites (unidad_creadora_id);
CREATE INDEX IF NOT EXISTS idx_tramites_fecha_creacion   ON tramites (fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_tramites_fecha_compromiso ON tramites (fecha_compromiso);

-- 3. Tabla tramite_documentos
CREATE TABLE IF NOT EXISTS tramite_documentos (
  id               SERIAL PRIMARY KEY,
  tramite_id       INTEGER      NOT NULL
                       REFERENCES tramites(id)
                       ON UPDATE CASCADE ON DELETE CASCADE,
  archivo_url      VARCHAR(500) NOT NULL,
  nombre_original  VARCHAR(255),
  subido_por_id    INTEGER      NOT NULL
                       REFERENCES usuarios(id)
                       ON UPDATE CASCADE ON DELETE RESTRICT,
  subido_en        TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tramite_docs_tramite ON tramite_documentos (tramite_id);

-- 4. Tabla comentarios_tramite
CREATE TABLE IF NOT EXISTS comentarios_tramite (
  id          SERIAL PRIMARY KEY,
  tramite_id  INTEGER   NOT NULL
                  REFERENCES tramites(id)
                  ON UPDATE CASCADE ON DELETE CASCADE,
  autor_id    INTEGER   NOT NULL
                  REFERENCES usuarios(id)
                  ON UPDATE CASCADE ON DELETE RESTRICT,
  contenido   TEXT      NOT NULL,
  creado_en   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_tramite_tramite ON comentarios_tramite (tramite_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_tramite_fecha   ON comentarios_tramite (creado_en DESC);

-- 5. Tabla auditoria_tramites
CREATE TABLE IF NOT EXISTS auditoria_tramites (
  id              SERIAL PRIMARY KEY,
  tramite_id      INTEGER         NOT NULL
                      REFERENCES tramites(id)
                      ON UPDATE CASCADE ON DELETE CASCADE,
  estado_anterior estatus_tramite,
  estado_nuevo    estatus_tramite NOT NULL,
  usuario_id      INTEGER         NOT NULL
                      REFERENCES usuarios(id)
                      ON UPDATE CASCADE ON DELETE RESTRICT,
  comentario      TEXT            NULL,
  fecha_cambio    TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_tramites_tramite ON auditoria_tramites (tramite_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_tramites_fecha   ON auditoria_tramites (fecha_cambio DESC);

-- 6. Registrar módulo
INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden)
VALUES ('tramites_seguimiento', 'Seguimiento de Trámites',
        'Gestión y seguimiento de trámites entre delegaciones y la Dirección Jurídica.',
        true, 3)
ON CONFLICT (clave) DO NOTHING;

-- =============================================================
-- FIN DEL SCRIPT
-- =============================================================
