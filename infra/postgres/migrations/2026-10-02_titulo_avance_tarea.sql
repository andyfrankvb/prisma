-- Título del avance que envía quien trabaja la actividad.
--
-- El avance ya existía: es lo que el operativo manda al enviar su actividad a
-- revisión, con su comentario y su documento (`historial_revision_tarea`, tipo
-- 'AVANCE'). Lo que faltaba era poder leer la historia del evento de un
-- vistazo: con solo comentarios largos y archivos adjuntos, el director tenía
-- que abrir cada actividad para saber en qué va.
--
-- Con un título corto y obligatorio, la bitácora del evento se vuelve una
-- secuencia legible: "Se entregó el diagnóstico", "Se recabaron las firmas".
-- El comentario queda como lo que siempre fue —el detalle para quien revisa— y
-- sigue siendo opcional.
--
-- Nulo en los avances anteriores: no se puede inventar un título para lo ya
-- enviado. La vista los muestra con el inicio de su comentario.
ALTER TABLE historial_revision_tarea
  ADD COLUMN IF NOT EXISTS titulo varchar(120);

-- La bitácora del evento cruza el historial con las actividades del evento y
-- ordena por fecha; sin este índice haría un recorrido completo cada vez.
CREATE INDEX IF NOT EXISTS idx_historial_revision_avances
  ON historial_revision_tarea (tarea_id, creado_en DESC)
  WHERE tipo = 'AVANCE';
