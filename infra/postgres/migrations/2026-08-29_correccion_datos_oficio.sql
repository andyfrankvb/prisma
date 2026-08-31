-- Corrección de los datos de captura de un oficio.
--
-- Hasta ahora, lo que la oficialía tecleaba al registrar —remitente, dependencia,
-- número de origen, asunto— quedaba fijo para siempre: no había ninguna ruta que
-- lo modificara. Un dedazo obligaba a descartar el registro y volver a capturar,
-- consumiendo un folio y dejando un oficio muerto en la bandeja.
--
-- Cada corrección se guarda campo por campo, con el valor anterior y el nuevo,
-- para que el historial pueda decir «cambió el remitente de X a Y» y no
-- simplemente «alguien editó esto». Sobre un expediente oficial, una corrección
-- silenciosa es peor que no poder corregir.
--
-- No se toca `auditoria_estados`: ahí solo viven las transiciones de estatus, y
-- una corrección no cambia el estatus. Es la misma razón por la que los pases de
-- firma y los turnos tienen su propia tabla.

CREATE TABLE IF NOT EXISTS oficio_correcciones (
  id              serial PRIMARY KEY,
  oficio_id       integer NOT NULL REFERENCES oficios(id) ON DELETE CASCADE,
  campo           varchar(64) NOT NULL,
  valor_anterior  text,
  valor_nuevo     text,
  usuario_id      integer NOT NULL REFERENCES usuarios(id),
  corregido_en    timestamptz NOT NULL DEFAULT now()
);

-- El historial de un oficio se consulta por oficio y en orden cronológico.
CREATE INDEX IF NOT EXISTS idx_oficio_correcciones_oficio
  ON oficio_correcciones (oficio_id, corregido_en);
