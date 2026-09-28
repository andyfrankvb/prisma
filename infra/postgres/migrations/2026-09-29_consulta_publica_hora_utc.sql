-- `consulta_publica.hora_busqueda` guarda instantes en UTC, pero el tipo no lo
-- decía, y eso se veía en pantalla: una búsqueda hecha a la 1:59 p.m. aparecía
-- a las 6:59 p.m., cinco horas adelantada.
--
-- El desfase venía de una doble conversión, no de un dato malo:
--   1. SID entrega `hora_busqueda` en UTC (2026-09-28T18:58:38Z), a diferencia
--      de su `fecha_registro`, que sí viene en hora local.
--   2. Al ser `timestamp` sin zona, la API lo leía como si esas 18:58 fueran
--      hora de Quintana Roo y lo reenviaba como 23:58 UTC.
--   3. El navegador restaba otras 5 horas al mostrarlo.
--
-- Con `timestamptz` el instante queda declarado una sola vez y cada capa lo
-- muestra en la zona que corresponde. Los valores existentes se reinterpretan
-- como UTC, que es lo que siempre fueron: no se pierde ni se altera ningún
-- dato, solo se nombra bien. Aplica igual a las 73,753 filas de la migración
-- inicial y a las que trae la sincronización (src/integraciones/consultas.sync.ts).
--
-- Quintana Roo no cambia de horario en el año, así que la conversión no tiene
-- casos de borde por horario de verano.
ALTER TABLE consulta_publica
  ALTER COLUMN hora_busqueda TYPE timestamptz
  USING hora_busqueda AT TIME ZONE 'UTC';

-- El default seguía siendo `now()` a secas, que con el tipo nuevo ya guarda el
-- instante con zona — se deja explícito para que no dependa del tipo.
ALTER TABLE consulta_publica
  ALTER COLUMN hora_busqueda SET DEFAULT now();

-- Mismo problema, menos visible, en la fecha que la pantalla muestra como
-- "Al día con SID": la escribe `now()` del servidor de base, cuya zona no
-- tiene por qué coincidir con la de la API ni con la del navegador. Con zona
-- explícita, los tres coinciden.
ALTER TABLE integracion_consultas_config
  ALTER COLUMN ultima_sincronizacion TYPE timestamptz USING ultima_sincronizacion AT TIME ZONE 'UTC',
  ALTER COLUMN actualizado_en        TYPE timestamptz USING actualizado_en        AT TIME ZONE 'UTC';

ALTER TABLE integracion_consultas_config
  ALTER COLUMN actualizado_en SET DEFAULT now();
