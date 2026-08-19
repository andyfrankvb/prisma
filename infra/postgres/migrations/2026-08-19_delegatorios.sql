-- Función Delegatorio: la Dirección General turna parte de un oficio a otra área
-- (delegación o dirección) sin soltar el oficio. Un oficio puede tener varios
-- delegatorios abiertos al mismo tiempo, uno por área destino.
--
-- No se agrega ningún estatus nuevo a `oficios`: el delegatorio vive aparte y el
-- bloqueo de la firma se calcula desde aquí. Así las bandejas, filtros y reportes
-- actuales siguen funcionando igual.

CREATE TABLE IF NOT EXISTS oficio_delegatorios (
  id                 SERIAL PRIMARY KEY,
  oficio_id          INTEGER NOT NULL REFERENCES oficios(id)            ON DELETE CASCADE,
  unidad_destino_id  INTEGER NOT NULL REFERENCES catalogo_unidades(id)  ON DELETE RESTRICT,

  -- Quién lo detonó (encargado de la DG o su jurídico) y qué solicita.
  solicitado_por_id  INTEGER NOT NULL REFERENCES usuarios(id),
  descripcion        TEXT    NOT NULL,

  -- A quién lo asignó el encargado del área destino.
  asignado_a_id      INTEGER REFERENCES usuarios(id),

  -- PENDIENTE   → esperando que el encargado destino lo asigne
  -- ASIGNADO    → alguien del área destino lo está trabajando
  -- EN_REVISION → ya subió documento; su encargado lo revisa
  -- CONTESTADO  → devuelto a quien lo detonó (cuenta como respondido)
  estado             VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',

  documento_url      TEXT,
  observacion        TEXT,
  respondido_por_id  INTEGER REFERENCES usuarios(id),

  creado_en          TIMESTAMPTZ DEFAULT now(),
  actualizado_en     TIMESTAMPTZ DEFAULT now(),
  respondido_en      TIMESTAMPTZ,

  -- No se delega dos veces a la misma área en el mismo oficio.
  CONSTRAINT uq_delegatorio_oficio_unidad UNIQUE (oficio_id, unidad_destino_id),
  CONSTRAINT delegatorio_estado_chk CHECK (
    estado IN ('PENDIENTE', 'ASIGNADO', 'EN_REVISION', 'CONTESTADO')
  )
);

CREATE INDEX IF NOT EXISTS idx_delegatorios_oficio  ON oficio_delegatorios (oficio_id);
CREATE INDEX IF NOT EXISTS idx_delegatorios_unidad  ON oficio_delegatorios (unidad_destino_id);
CREATE INDEX IF NOT EXISTS idx_delegatorios_estado  ON oficio_delegatorios (estado);

-- Historial de idas y vueltas: la reconsideración puede ocurrir las veces que
-- haga falta, tanto entre el encargado destino y su gente como entre quien
-- detonó y el encargado destino.
CREATE TABLE IF NOT EXISTS delegatorio_comentarios (
  id              SERIAL PRIMARY KEY,
  delegatorio_id  INTEGER NOT NULL REFERENCES oficio_delegatorios(id) ON DELETE CASCADE,
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  comentario      TEXT    NOT NULL,
  estado_previo   VARCHAR(20),
  creado_en       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delegatorio_coment ON delegatorio_comentarios (delegatorio_id);
