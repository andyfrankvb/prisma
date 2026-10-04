-- La transcripción pertenece al DOCUMENTO, no a la foja.
--
-- `visor_transcripciones_foja` nació del prototipo VISAR, donde cada foja tenía
-- una sola imagen: por eso su clave única era `foja_id` a secas. Con las
-- campañas de digitalización eso dejó de ser cierto. Una misma inscripción
-- tiene hoy hasta dos documentos —la primera digitalización y PEMR 2025— y cada
-- uno es un escaneo distinto: distinta calidad, distinto encuadre, a veces
-- fondo negro. Su texto reconocido no es el mismo.
--
-- Con la clave anterior pasaban dos cosas, ninguna buena:
--   · Transcribir mientras se veía una versión SOBRESCRIBÍA la transcripción de
--     la otra, en silencio (el ON CONFLICT (foja_id) hacía merge).
--   · Y lo guardado no decía de qué versión salía, así que nadie podía saber a
--     cuál correspondía el texto.
--
-- Se agrega la versión y la clave pasa a ser el par. Así cada documento tiene su
-- transcripción, y al cambiar de campaña en el Visor se ve la que le toca.
--
-- No hay datos que migrar: al escribir esto la tabla está vacía, tanto en
-- producción como en local.

ALTER TABLE visor_transcripciones_foja
  ADD COLUMN IF NOT EXISTS version varchar(20);

-- Por si alguna fila existiera en algún entorno: se le asigna la versión de su
-- única imagen, que es lo que necesariamente transcribió.
UPDATE visor_transcripciones_foja t
   SET version = (SELECT i.version FROM visor_imagenes_foja i
                   WHERE i.foja_id = t.foja_id
                   ORDER BY i.id LIMIT 1)
 WHERE t.version IS NULL;

-- Las que no tengan imagen de la cual deducirla quedan marcadas, en vez de
-- perderse o bloquear la migración.
UPDATE visor_transcripciones_foja SET version = 'V_SID' WHERE version IS NULL;

ALTER TABLE visor_transcripciones_foja
  ALTER COLUMN version SET NOT NULL;

ALTER TABLE visor_transcripciones_foja
  DROP CONSTRAINT IF EXISTS visor_transcripciones_foja_foja_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_visor_transcripciones_foja_version
  ON visor_transcripciones_foja (foja_id, version);

COMMENT ON COLUMN visor_transcripciones_foja.version IS
  'Campaña de digitalización del documento transcrito (visor_campanias.clave). Cada escaneo tiene su propio texto reconocido.';
