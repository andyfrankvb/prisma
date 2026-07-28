-- Documentos adjuntos categorizados del Ingreso de Oficio.
-- Cada oficio puede llevar hasta 5 documentos, uno por tipo.
-- Tipos: anexos | identificacion | oficio | recibos | solicitud
CREATE TABLE IF NOT EXISTS oficio_documentos (
  id              SERIAL PRIMARY KEY,
  oficio_id       INTEGER NOT NULL REFERENCES oficios(id) ON DELETE CASCADE,
  tipo            VARCHAR(40)  NOT NULL,
  archivo_url     VARCHAR(255) NOT NULL,
  nombre_original VARCHAR(255),
  subido_por_id   INTEGER REFERENCES usuarios(id),
  subido_en       TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT chk_oficio_documentos_tipo
    CHECK (tipo IN ('anexos','identificacion','oficio','recibos','solicitud'))
);

CREATE INDEX IF NOT EXISTS idx_oficio_documentos_oficio
  ON oficio_documentos(oficio_id);
