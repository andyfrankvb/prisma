-- Avances en el hilo del evento: entradas con título, al estilo de un commit.
--
-- La conversación del evento (2026-10-01_comentarios_evento.sql) sirve para
-- acordar cosas, pero no para contar en qué va el evento: quien lo abre un mes
-- después tiene que leerlo todo. Un avance es una entrada con título corto, y
-- la línea de tiempo se vuelve legible de un vistazo.
--
-- El TÍTULO decide el tipo: con título es un avance, sin título es un
-- comentario. Así no hay estados imposibles —un avance sin título, o un título
-- huérfano— ni una columna de tipo que pueda contradecir al contenido.
ALTER TABLE comentarios_evento
  ADD COLUMN IF NOT EXISTS titulo varchar(120);

-- Un avance puede referirse a una actividad concreta del evento, y entonces se
-- lee el progreso por actividad. `ON DELETE SET NULL` y no CASCADE: si la
-- actividad se borra, el avance narrado sigue siendo parte de la historia del
-- evento y no debe desaparecer con ella.
ALTER TABLE comentarios_evento
  ADD COLUMN IF NOT EXISTS tarea_id integer REFERENCES tareas_evento(id) ON DELETE SET NULL;

-- La tarjeta del evento muestra el último avance, y el hilo los filtra aparte.
CREATE INDEX IF NOT EXISTS idx_comentarios_evento_avances
  ON comentarios_evento (evento_id, creado_en DESC)
  WHERE titulo IS NOT NULL;
