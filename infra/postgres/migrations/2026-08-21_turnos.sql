-- ─────────────────────────────────────────────────────────────
-- Turnar un oficio a otra área
--
-- A veces un oficio llega dirigido a un área que no tiene competencia sobre lo
-- solicitado. El encargado de esa área lo turna a la que sí corresponde —otra
-- dirección o una delegación— y el oficio entra al flujo de la nueva, desde el
-- principio.
--
-- A diferencia del delegatorio, aquí el oficio se va completo y no regresa: por
-- eso cambia `oficios.dirigido_a_id` y se reinicia el estatus.
--
-- El folio NO cambia: es el que ya se entregó en el acuse, y cambiarlo rompería
-- la trazabilidad. Esta tabla guarda el recorrido para saber por dónde pasó.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oficio_turnos (
  id                  SERIAL PRIMARY KEY,
  oficio_id           INTEGER   NOT NULL REFERENCES oficios(id) ON UPDATE CASCADE ON DELETE CASCADE,
  unidad_origen_id    INTEGER   REFERENCES catalogo_unidades(id),
  unidad_destino_id   INTEGER   NOT NULL REFERENCES catalogo_unidades(id),
  dirigido_anterior_id INTEGER  REFERENCES usuarios(id),
  dirigido_nuevo_id   INTEGER   REFERENCES usuarios(id),
  estatus_previo      VARCHAR(30),
  motivo              TEXT      NOT NULL,
  turnado_por_id      INTEGER   NOT NULL REFERENCES usuarios(id),
  creado_en           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_turnos_oficio  ON oficio_turnos (oficio_id);
CREATE INDEX IF NOT EXISTS idx_turnos_destino ON oficio_turnos (unidad_destino_id);
