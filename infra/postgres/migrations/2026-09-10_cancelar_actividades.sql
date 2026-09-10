-- Una actividad se puede cancelar, y se sabe por qué.
--
-- ── Qué problema resuelve ────────────────────────────────────────────────────
--
-- Hoy una actividad no se puede quitar de ninguna forma. Si se repartió por error,
-- si se duplicó, o si el asunto se cayó, ahí se queda ocupando el tablero y
-- contando como pendiente para siempre.
--
-- Y no basta con «borrarla», porque son dos casos distintos que solo se parecen
-- desde fuera:
--
--   · SE CREÓ POR ERROR — un duplicado, el evento equivocado, la persona
--     equivocada. No ocurrió nada. Ahí se borra de verdad; dejar rastro de algo
--     que nunca existió solo ensucia.
--   · YA NO APLICA — se repartió, alguien avanzó, subió documentos, y después el
--     asunto se canceló. Ahí sí ocurrió algo, y borrarlo destruiría la constancia
--     del trabajo de una persona.
--
-- Lo que separa los dos casos no es la intención de quien pulsa el botón, sino si
-- algo pasó — y eso el sistema lo sabe solo: si la actividad tiene historial de
-- revisión, comentarios o documentos, no se borra, se cancela.
--
-- ── Por qué importa no borrar lo trabajado ───────────────────────────────────
--
-- Todo cuelga en cascada de `tareas_evento`: `historial_revision_tarea`,
-- `comentarios_tarea` y `notificaciones` se van con ella sin decir nada. Peor: los
-- documentos que la gente sube viven en la carpeta compartida, NO en la base, así
-- que un borrado quita el renglón que apunta al archivo y deja el archivo huérfano
-- en el disco para siempre, sin que nadie sepa de qué era.

-- ── El estado ────────────────────────────────────────────────────────────────
--
-- `estado_tarea` es un enum, así que el valor nuevo se declara. Va al final de la
-- lista: el orden del enum se usa para ordenar, y una actividad cancelada va
-- después de las vivas, no entre ellas.
ALTER TYPE estado_tarea ADD VALUE IF NOT EXISTS 'CANCELADA';

-- ── El porqué ────────────────────────────────────────────────────────────────
--
-- Cancelar sin explicar deja a quien la tenía asignada sin saber si su trabajo se
-- desechó, se pospuso o se le pasó a otro. El motivo es obligatorio en el
-- controlador; la columna admite nulos porque las actividades que ya existen nunca
-- pasaron por aquí.
ALTER TABLE tareas_evento
  ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT,
  ADD COLUMN IF NOT EXISTS cancelada_en       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelada_por_id   INTEGER
    REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE SET NULL;

COMMENT ON COLUMN tareas_evento.motivo_cancelacion IS
  'Por qué se canceló. Obligatorio al cancelar: sin esto, quien la tenía asignada no sabe si su trabajo se desechó o se pospuso.';

-- ── Los conteos del tablero ──────────────────────────────────────────────────
--
-- Una actividad cancelada no es pendiente ni vencida: nadie la va a hacer. Las
-- consultas que cuentan excluyen ya los estados terminales con
-- `NOT IN ('COMPLETADA','FINALIZADO')`, y hay que sumar este a esa lista — si no,
-- lo cancelado seguiría apareciendo como trabajo atrasado. Eso se corrige en el
-- código, no aquí; queda anotado para que se revise junto con esta migración.
