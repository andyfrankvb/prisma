-- ─────────────────────────────────────────────────────────────
-- Catálogo de correos para la recepción por correo electrónico
--
-- Son dos listas independientes: los correos DESDE los que las autoridades
-- envían, y las cuentas institucionales que los RECIBEN. Ninguna depende de la
-- otra — se capturan y se buscan por separado, como el catálogo de remitentes.
--
-- Se guardan en minúsculas: un correo no distingue mayúsculas y así no se
-- duplica la misma cuenta escrita de dos formas.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalogo_correos (
  id             SERIAL PRIMARY KEY,
  tipo           VARCHAR(10)  NOT NULL CHECK (tipo IN ('ORIGEN', 'DESTINO')),
  correo         VARCHAR(255) NOT NULL,
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_por_id  INTEGER      REFERENCES usuarios(id),
  creado_en      TIMESTAMP    NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_correos_tipo_correo_key UNIQUE (tipo, correo)
);

CREATE INDEX IF NOT EXISTS idx_catalogo_correos_tipo ON catalogo_correos (tipo, correo);
