-- Prioridad manual de los eventos en la lista principal.
--
-- Hasta ahora la lista se ordenaba por fecha de creación: lo más nuevo arriba.
-- Eso no dice qué es más importante, y en una lista larga lo urgente queda
-- enterrado bajo lo reciente. Con `orden` cada quien sube o baja sus eventos.
--
-- `orden` es una llave de ordenamiento, no una posición: los huecos entre
-- valores son normales y no hay que renumerar la tabla en cada movimiento.
ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS orden integer;

-- Movimiento reciente, para la flecha de subió/bajó.
--
-- Se guarda el acumulado y cuándo ocurrió, no la posición anterior: la flecha
-- responde "cuántos lugares se movió esto hace poco", y con eso basta. Si se
-- mueve tres veces seguidas suma 3; pasada la ventana, el contador vuelve a
-- empezar. Así no hace falta guardar fotos del orden ni un proceso semanal.
ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS movimiento_neto integer NOT NULL DEFAULT 0;

ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS movimiento_en timestamptz;

-- Los eventos que ya existen conservan el orden que hoy ve la gente —lo más
-- nuevo arriba— para que nadie encuentre su lista revuelta al desplegar.
UPDATE eventos e
   SET orden = s.fila
  FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY fecha_creacion DESC, id DESC) AS fila
          FROM eventos) s
 WHERE s.id = e.id
   AND e.orden IS NULL;

CREATE INDEX IF NOT EXISTS idx_eventos_orden ON eventos (orden);
