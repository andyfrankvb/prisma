-- ─────────────────────────────────────────────────────────────
-- Oficios «de conocimiento»
--
-- Hay oficios que no piden respuesta: solo informan algo a la operación
-- interna. La Dirección Jurídica los marca así y el oficio queda cerrado sin
-- pasar por proyecto, visto bueno ni firma.
--
-- Se guarda el estatus que traía para poder desmarcarlo si fue un error: al
-- quitar la marca, el oficio regresa justo a donde estaba en el flujo.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE oficios
  ADD COLUMN IF NOT EXISTS de_conocimiento     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS de_conocimiento_por INTEGER REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS de_conocimiento_en  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS estatus_previo_conocimiento estatus_oficio;

COMMENT ON COLUMN oficios.de_conocimiento             IS 'Oficio informativo: se cierra sin pasar por el flujo de contestación';
COMMENT ON COLUMN oficios.de_conocimiento_por         IS 'Quién lo marcó de conocimiento';
COMMENT ON COLUMN oficios.de_conocimiento_en          IS 'Cuándo se marcó';
COMMENT ON COLUMN oficios.estatus_previo_conocimiento IS 'Estatus que traía antes de marcarse, para poder revertir';
