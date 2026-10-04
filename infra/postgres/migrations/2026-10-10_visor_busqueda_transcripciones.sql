-- Búsqueda por el contenido de las transcripciones del Visor.
--
-- Hasta ahora solo se podía llegar a un documento sabiendo de antemano su tomo
-- y su inscripción. Con esto se puede buscar por lo que dice adentro: el nombre
-- de una persona, un predio, un juzgado — que es como se busca cuando no se
-- tiene el dato exacto.
--
-- Sirve igual para inscripciones y para libros: lo que se indexa es la
-- transcripción de una FOJA, y una foja puede ser cualquiera de las dos.
--
-- ── Por qué `unaccent` ────────────────────────────────────────────────────
-- El texto viene de reconocer escaneos viejos, y el OCR pone acentos donde no
-- van y los quita donde sí. Sin normalizar, buscar "Martínez" no encontraría
-- "MARTINEZ" ni "Martinez", que es como va a salir la mayoría de las veces.
--
-- La configuración propia existe porque `unaccent` no se puede usar dentro de
-- una columna generada: Postgres exige que todo lo que la calcule sea
-- inmutable, y `unaccent(text)` no lo es —depende del diccionario instalado—.
-- Una configuración de búsqueda que ya trae el diccionario encadenado sí lo es.
CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'espanol_sin_acentos') THEN
    CREATE TEXT SEARCH CONFIGURATION espanol_sin_acentos (COPY = spanish);
    ALTER TEXT SEARCH CONFIGURATION espanol_sin_acentos
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, spanish_stem;
  END IF;
END $$;

-- ── El índice ─────────────────────────────────────────────────────────────
-- Columna generada y no un disparador: se mantiene sola, no se puede olvidar
-- actualizarla, y queda claro en el esquema de dónde sale.
ALTER TABLE visor_transcripciones_foja
  ADD COLUMN IF NOT EXISTS busqueda tsvector
  GENERATED ALWAYS AS (to_tsvector('espanol_sin_acentos', coalesce(texto_transcrito, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_visor_transcripciones_busqueda
  ON visor_transcripciones_foja USING GIN (busqueda);

COMMENT ON COLUMN visor_transcripciones_foja.busqueda IS
  'Índice de texto completo del documento transcrito, en español y sin acentos. Se mantiene solo.';
