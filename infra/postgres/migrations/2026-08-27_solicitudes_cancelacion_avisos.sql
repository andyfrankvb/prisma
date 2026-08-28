-- Cancelar la propia solicitud, y avisar de las que se quedaron regadas.
--
-- Al abrir las solicitudes a todas las áreas —antes solo la Dirección General
-- podía detonarlas— el freno que ya existía se vuelve un riesgo real: mientras
-- una solicitud siga abierta, el oficio de quien la pidió no puede recibir visto
-- bueno ni firma. Si el área destino se olvida, el trámite se queda parado sin
-- que nadie tenga forma de sacarlo.
--
-- Se atacan las dos mitades del problema:
--   · CANCELADO — quien pidió puede cerrar su propia solicitud, con motivo. Sirve
--     cuando ya no la necesita, o cuando le pidió a la que no era. Es distinto de
--     RECHAZADO, que es el área destino diciendo «no me compete»: en el
--     expediente no deben verse iguales.
--   · Las marcas de aviso, para no repetir la misma notificación cada vez que
--     corre la revisión. Sin ellas, a los tres días el encargado recibiría el
--     mismo recordatorio en cada pasada.

ALTER TABLE oficio_delegatorios
  DROP CONSTRAINT IF EXISTS delegatorio_estado_chk;

ALTER TABLE oficio_delegatorios
  ADD CONSTRAINT delegatorio_estado_chk
  CHECK (estado IN ('PENDIENTE', 'ASIGNADO', 'EN_REVISION', 'CONTESTADO', 'RECHAZADO', 'CANCELADO'));

ALTER TABLE oficio_delegatorios
  ADD COLUMN IF NOT EXISTS cancelado_en    timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por_id integer REFERENCES usuarios(id),
  -- Cuándo se avisó de cada demora. Nulas mientras no haya hecho falta avisar.
  ADD COLUMN IF NOT EXISTS aviso_sin_asignar_en   timestamptz,
  ADD COLUMN IF NOT EXISTS aviso_sin_responder_en timestamptz;

-- La revisión de demoras solo mira las solicitudes que siguen abiertas, que son
-- siempre una minoría del total.
CREATE INDEX IF NOT EXISTS ix_delegatorios_abiertos
  ON oficio_delegatorios (creado_en)
  WHERE estado IN ('PENDIENTE', 'ASIGNADO', 'EN_REVISION');
