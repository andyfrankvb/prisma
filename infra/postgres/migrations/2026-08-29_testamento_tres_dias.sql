-- El plazo de la búsqueda de testamentos pasa de 10 días hábiles a 3.
--
-- Antes eran dos etapas de 5 días. Ahora son 2 días hábiles para que las
-- delegaciones busquen y entreguen, y 1 más para que la Dirección General arme
-- el proyecto de contestación: 3 en total.
--
-- El cambio de las constantes solo alcanza a los oficios que se marquen de aquí
-- en adelante, porque las fechas se calculan al marcar y quedan guardadas. Los
-- que ya estaban marcados conservarían plazos que hoy nadie reconoce, así que
-- aquí se recalculan con la nueva regla, contando desde la misma fecha en que
-- cada uno se marcó (`testamento_en`) para no regalar ni quitar tiempo por el
-- momento en que se corra esta migración.
--
-- Días hábiles = de lunes a viernes, igual que en `src/utils/dias-habiles.ts`.
-- El catálogo de días festivos todavía no existe en el sistema; cuando exista,
-- estas fechas podrían necesitar un nuevo ajuste.

UPDATE oficios o
SET
  -- 2.º día hábil después de haberse marcado
  testamento_vence_delegaciones = (
    SELECT d::date
      FROM generate_series(o.testamento_en::date + 1,
                           o.testamento_en::date + 30,
                           interval '1 day') AS d
     WHERE extract(isodow FROM d) < 6
     ORDER BY d OFFSET 1 LIMIT 1
  ),
  -- 3.er día hábil después de haberse marcado
  testamento_vence_encargado = (
    SELECT d::date
      FROM generate_series(o.testamento_en::date + 1,
                           o.testamento_en::date + 30,
                           interval '1 day') AS d
     WHERE extract(isodow FROM d) < 6
     ORDER BY d OFFSET 2 LIMIT 1
  ),
  -- Si el término del oficio se había fijado a partir del testamento —es decir,
  -- coincide exactamente con el plazo anterior— se mueve con él. Si la autoridad
  -- había puesto su propio plazo, no se toca: ese no lo decide este módulo.
  fecha_vencimiento = CASE
    WHEN o.fecha_vencimiento::date = o.testamento_vence_encargado
      THEN (
        SELECT d::date
          FROM generate_series(o.testamento_en::date + 1,
                               o.testamento_en::date + 30,
                               interval '1 day') AS d
         WHERE extract(isodow FROM d) < 6
         ORDER BY d OFFSET 2 LIMIT 1
      )
    ELSE o.fecha_vencimiento
  END
WHERE o.testamento IS TRUE
  AND o.testamento_en IS NOT NULL;
