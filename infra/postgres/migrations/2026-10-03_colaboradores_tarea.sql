-- Actividades que se elaboran en equipo.
--
-- Una actividad tenía una sola persona asignada (`tareas_evento.asignado_a_id`,
-- con `reasignado_a_id` para la delegación). Pero hay trabajo que se hace entre
-- varios, y hasta ahora eso obligaba a partir la actividad en pedazos
-- artificiales o a dejar fuera a quienes sí la trabajan.
--
-- Se suma un equipo SIN tocar la figura del responsable: `asignado_a_id` sigue
-- siendo quien responde por la actividad, y de eso dependen el flujo de
-- revisión, los avisos y los tableros —58 lugares del código—. Los colaboradores
-- se agregan aquí, de forma aditiva: nada de lo que hoy funciona cambia de
-- significado.
CREATE TABLE IF NOT EXISTS tarea_colaboradores (
  id              serial      PRIMARY KEY,
  tarea_id        integer     NOT NULL REFERENCES tareas_evento(id) ON DELETE CASCADE,
  usuario_id      integer     NOT NULL REFERENCES usuarios(id)      ON DELETE CASCADE,
  -- Quién lo sumó al equipo: queda el rastro de cómo se formó.
  agregado_por_id integer     REFERENCES usuarios(id) ON DELETE SET NULL,
  agregado_en     timestamptz NOT NULL DEFAULT now(),
  -- Nadie dos veces en la misma actividad.
  CONSTRAINT tarea_colaboradores_unicos UNIQUE (tarea_id, usuario_id)
);

-- Las dos preguntas que se hacen todo el tiempo: "¿quiénes trabajan esta
-- actividad?" y "¿en cuáles participo yo?".
CREATE INDEX IF NOT EXISTS idx_tarea_colaboradores_tarea   ON tarea_colaboradores (tarea_id);
CREATE INDEX IF NOT EXISTS idx_tarea_colaboradores_usuario ON tarea_colaboradores (usuario_id);
