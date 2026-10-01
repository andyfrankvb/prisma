-- Comentarios a nivel evento: la conversación entre quienes lo trabajan.
--
-- Hasta ahora solo se podía comentar dentro de una actividad
-- (`comentarios_tarea`). Pero la coordinación del evento —acuerdos, avisos,
-- dudas que no pertenecen a una actividad concreta— no tenía dónde quedar, y
-- terminaba por fuera del sistema. Esta tabla le da lugar, con el mismo
-- esquema que ya usan los comentarios de tarea y de trámite.
--
-- `creado_en` va con zona horaria a propósito: los comentarios de tarea la
-- guardan sin ella, y eso ya nos costó un desfase visible de 5 horas en
-- Consulta Pública (ver 2026-09-29_consulta_publica_hora_utc.sql). No se
-- repite el error en tabla nueva.
CREATE TABLE IF NOT EXISTS comentarios_evento (
  id         serial      PRIMARY KEY,
  evento_id  integer     NOT NULL REFERENCES eventos(id)  ON DELETE CASCADE,
  autor_id   integer     NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  contenido  text        NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

-- El hilo siempre se lee completo y en orden de un solo evento.
CREATE INDEX IF NOT EXISTS idx_comentarios_evento_hilo
  ON comentarios_evento (evento_id, creado_en);

-- Aditivo sobre `notificaciones`, mismo patrón que oficio_id/tarea_id/ticket_id:
-- permite que el aviso del comentario lleve al evento correspondiente.
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS evento_id integer REFERENCES eventos(id) ON DELETE CASCADE;
