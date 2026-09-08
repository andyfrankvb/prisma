-- La fecha de una actividad deja de ser obligatoria.
--
-- ── Por qué ──────────────────────────────────────────────────────────────────
--
-- `tareas_evento.fecha_programada` nació NOT NULL, así que al agregar una
-- actividad había que ponerle fecha sí o sí. En la práctica no siempre se sabe:
-- se reparte el trabajo primero y el plazo se acuerda después, o simplemente no
-- hay plazo. Obligar a poner una fecha en ese momento produce fechas inventadas,
-- que es peor que no tener ninguna: el tablero marca vencimientos que nadie
-- pactó y la gente aprende a ignorar los avisos.
--
-- El evento ya funcionaba así —su `fecha_programada` es opcional—, de modo que
-- esto solo alinea la actividad con su evento.
--
-- ── Qué se rompe si no se revisa lo demás ────────────────────────────────────
--
-- Los conteos del tablero comparan contra esta fecha:
--
--   tareas_vencidas  → fecha_programada < CURRENT_DATE
--   tareas_proximas  → fecha_programada BETWEEN hoy AND hoy + 3 días
--
-- En SQL, una comparación contra NULL no es verdadera ni falsa: simplemente no
-- entra. Así que una actividad sin fecha no se cuenta como vencida ni como
-- próxima, que es exactamente lo que corresponde —sin plazo no hay nada que
-- vencer—. No hay que tocar esas consultas.
--
-- El vigilante de vencimientos (`deadline.scheduler`) se comporta igual: busca
-- las que ya pasaron su fecha, y una sin fecha nunca aparece.

ALTER TABLE tareas_evento ALTER COLUMN fecha_programada DROP NOT NULL;

COMMENT ON COLUMN tareas_evento.fecha_programada IS
  'Fecha límite de la actividad. Opcional: sin ella la actividad no vence ni entra en los conteos de próximas.';
