-- Bitácora de la marca «de conocimiento».
--
-- Marcar un oficio de conocimiento lo cierra, y quitar la marca lo devuelve al
-- punto del flujo donde estaba. Las dos cosas quedaban en la auditoría solo como
-- un cambio de estatus: al marcarlo se leía «FINALIZADO», igual que un oficio
-- firmado, y al desmarcarlo un salto de estatus sin explicación.
--
-- El oficio ya guarda quién y cuándo lo marcó la última vez, pero eso se pisa en
-- cada movimiento. Aquí queda cada ida y vuelta, que es lo que hace falta para
-- saber qué pasó con el oficio y quién lo decidió.

CREATE TABLE IF NOT EXISTS oficio_conocimiento (
  id                 serial      PRIMARY KEY,
  oficio_id          integer     NOT NULL REFERENCES oficios(id)  ON UPDATE CASCADE ON DELETE CASCADE,
  -- true: se marcó de conocimiento. false: se le quitó la marca.
  marcado            boolean     NOT NULL,
  -- Al quitar la marca, a qué punto del flujo regresó el oficio.
  estatus_restaurado varchar(24),
  usuario_id         integer     NOT NULL REFERENCES usuarios(id),
  creado_en          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_conocimiento_oficio ON oficio_conocimiento (oficio_id);
