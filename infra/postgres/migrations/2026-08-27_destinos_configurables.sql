-- Qué área le puede escribir a qué área.
--
-- Hasta ahora esto vivía en el código, y en dos lugares distintos que no se
-- ponían de acuerdo: el delegatorio solo se podía detonar desde la Dirección
-- General, y la lista de destinos se recortaba preguntando si la *persona* era
-- de Jurídica. Quien cargaba dos papeles a la vez —encargado de Jurídica y de la
-- Dirección General— recibía la lista recortada aun trabajando un oficio de la
-- Dirección General, y desde ahí no podía pedirle nada a Jurídica ni a
-- Administrativa. Ahora la pregunta es por el oficio y no por quién la hace.
--
-- La tabla guarda EXCEPCIONES, no permisos: lo que no está aquí, está
-- permitido. Así, el día que se dé de alta una dirección nueva queda disponible
-- sola, en vez de permanecer invisible hasta que alguien se acuerde de
-- habilitarla. El SuperAdmin quita, no habilita.

CREATE TABLE IF NOT EXISTS configuracion_destinos (
  unidad_origen_id   integer     NOT NULL REFERENCES catalogo_unidades(id) ON DELETE CASCADE,
  unidad_destino_id  integer     NOT NULL REFERENCES catalogo_unidades(id) ON DELETE CASCADE,
  permitido          boolean     NOT NULL DEFAULT true,
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_por_id integer     REFERENCES usuarios(id),
  PRIMARY KEY (unidad_origen_id, unidad_destino_id),
  -- Un área no se turna a sí misma; el resto del código ya lo rechaza, pero
  -- conviene que la configuración tampoco lo pueda expresar.
  CONSTRAINT destino_distinto_del_origen CHECK (unidad_origen_id <> unidad_destino_id)
);

-- Estado inicial acordado: una delegación se dirige a las direcciones, no a las
-- otras delegaciones. Si a una delegación le llega algo que le toca a otra, sube
-- por una dirección y de ahí baja, para que la dirección se entere del cambio.
--
-- Se siembra como negaciones explícitas —doce renglones— porque todo lo demás
-- queda abierto por omisión y no necesita registro.
INSERT INTO configuracion_destinos (unidad_origen_id, unidad_destino_id, permitido)
SELECT origen.id, destino.id, false
  FROM catalogo_unidades origen
  JOIN catalogo_unidades destino ON destino.id <> origen.id
 WHERE origen.tipo  = 'DELEGACION'
   AND destino.tipo = 'DELEGACION'
ON CONFLICT (unidad_origen_id, unidad_destino_id) DO NOTHING;

-- Se consulta siempre por el origen («¿a quién le puede escribir esta área?»),
-- nunca al revés.
CREATE INDEX IF NOT EXISTS ix_destinos_origen
  ON configuracion_destinos (unidad_origen_id) WHERE NOT permitido;
