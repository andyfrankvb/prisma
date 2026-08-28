-- Aceptar un oficio que llegó turnado, y cerrar la puerta de rechazarlo.
--
-- «Devolver a quien lo turnó» no tenía ventana de cierre: bastaba que el oficio
-- hubiera llegado por un turno para que la opción siguiera ahí después de
-- asignarlo, de redactarlo y hasta después del visto bueno. Y devolver regresa
-- el oficio al área de origen dejándolo en RECIBIDO, así que un clic en ese
-- momento dejaba huérfanos el proyecto y la aprobación: el expediente terminaba
-- diciendo que el área nunca lo tomó, cuando lo había trabajado completo.
--
-- Ahora recibir es un acto explícito. Mientras el turno no esté aceptado, el
-- área puede regresarlo; una vez aceptado, la salida es turnarlo de nuevo por no
-- competencia —que queda escrito como lo que es, un movimiento nuevo con su
-- justificación, y no como si el turno jamás hubiera ocurrido—.
--
-- La aceptación vive en el turno y no en el oficio: un mismo oficio puede pasar
-- por varias áreas, y cada una acepta el suyo.

ALTER TABLE oficio_turnos
  ADD COLUMN IF NOT EXISTS aceptado_en     timestamptz,
  ADD COLUMN IF NOT EXISTS aceptado_por_id integer REFERENCES usuarios(id);

-- Lo que ya está en marcha se da por aceptado. Sin esto, todos los oficios
-- turnados que las áreas llevan semanas trabajando aparecerían de golpe como
-- «pendientes de aceptar», y peor: se podrían rechazar, que es justo el defecto
-- que se está cerrando. Solo quedan por aceptar los que nadie ha tocado.
UPDATE oficio_turnos t
   SET aceptado_en     = t.creado_en,
       aceptado_por_id = t.turnado_por_id
  FROM oficios o
 WHERE o.id = t.oficio_id
   AND t.aceptado_en IS NULL
   AND o.estatus <> 'RECIBIDO';

-- Las devoluciones no se aceptan: son el regreso de un turno, no uno nuevo.
UPDATE oficio_turnos
   SET aceptado_en     = creado_en,
       aceptado_por_id = turnado_por_id
 WHERE aceptado_en IS NULL
   AND es_devolucion;

CREATE INDEX IF NOT EXISTS ix_turnos_por_aceptar
  ON oficio_turnos (oficio_id) WHERE aceptado_en IS NULL;
