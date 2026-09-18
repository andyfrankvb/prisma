-- Catálogo de Vigilancia y Alertas sobre Consulta Pública SIQROO.
--
-- `sujeto_vigilado`: catálogo curado de personas/empresas de interés. Guarda
-- `nombre_normalizado` (mayúsculas, sin acentos) precalculado para que el
-- matching en cada nueva consulta sea una comparación de texto simple, sin
-- normalizar en cada búsqueda.
--
-- `alerta_consulta`: una fila por cada vez que una búsqueda de Consulta
-- Pública coincide con un sujeto vigilado activo. `ON DELETE CASCADE` en
-- ambas FK porque una alerta no tiene sentido sin la consulta ni el sujeto
-- que la originaron.
CREATE TABLE IF NOT EXISTS sujeto_vigilado (
  id                  serial       PRIMARY KEY,
  nombre_razon_social varchar(255) NOT NULL,
  nombre_normalizado  varchar(255) NOT NULL,
  tipo                varchar(10)  NOT NULL CHECK (tipo IN ('PERSONA', 'EMPRESA')),
  activo              boolean      NOT NULL DEFAULT true,
  creado_por          integer      NOT NULL REFERENCES usuarios(id),
  fecha_creacion      timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sujeto_vigilado_activo ON sujeto_vigilado(activo);

CREATE TABLE IF NOT EXISTS alerta_consulta (
  id                     serial    PRIMARY KEY,
  consulta_id            integer   NOT NULL REFERENCES consulta_publica(id) ON DELETE CASCADE,
  sujeto_vigilado_id     integer   NOT NULL REFERENCES sujeto_vigilado(id)  ON DELETE CASCADE,
  coincidencia_detectada varchar(255) NOT NULL,
  fecha_alerta           timestamp NOT NULL DEFAULT now(),
  leido                  boolean   NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_alerta_consulta_leido        ON alerta_consulta(leido);
CREATE INDEX IF NOT EXISTS idx_alerta_consulta_fecha_alerta ON alerta_consulta(fecha_alerta DESC);
CREATE INDEX IF NOT EXISTS idx_alerta_consulta_sujeto       ON alerta_consulta(sujeto_vigilado_id);

-- Aditivo sobre `notificaciones` (mismo patrón que oficio_id/tarea_id/tramite_id):
-- referencia opcional para el aviso in-app de una alerta de vigilancia.
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS alerta_vigilancia_id integer REFERENCES alerta_consulta(id) ON DELETE CASCADE;
