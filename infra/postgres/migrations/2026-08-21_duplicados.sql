-- ─────────────────────────────────────────────────────────────
-- Detección de oficios duplicados
--
-- El número de oficio viene con nomenclaturas muy distintas según la autoridad
-- (FED/FECOC/UEIDCSPCAJ-QR/0001531/2023, CAJ/4775/2026, PJ-OAJ-JZFOCHE-7425/2026)
-- y a veces se captura incompleto o con un carácter equivocado. Para poder
-- compararlos se guardan dos formas derivadas:
--
--   numero_normalizado → solo letras y dígitos, en mayúsculas. Iguala el mismo
--                        número escrito con «/», «-», puntos o espacios.
--   digitos_oficio     → solo los dígitos. Sirve cuando el prefijo se escribió
--                        mal o se omitió.
--
-- Ambas son columnas GENERADAS: Postgres las calcula solo, también para los
-- oficios que ya estaban capturados, así que no hace falta rellenarlas a mano.
--
-- archivo_hash guarda la huella SHA-256 del PDF del oficio: si suben
-- exactamente el mismo archivo, coincide aunque el número se haya escrito
-- distinto. Se calcula al subir, por eso no es generada.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE oficios
  ADD COLUMN IF NOT EXISTS numero_normalizado TEXT
    GENERATED ALWAYS AS (
      upper(regexp_replace(coalesce(numero_oficio_origen, ''), '[^a-zA-Z0-9]', '', 'g'))
    ) STORED,
  ADD COLUMN IF NOT EXISTS digitos_oficio TEXT
    GENERATED ALWAYS AS (
      regexp_replace(coalesce(numero_oficio_origen, ''), '[^0-9]', '', 'g')
    ) STORED,
  ADD COLUMN IF NOT EXISTS archivo_hash VARCHAR(64);

-- La comparación siempre se hace dentro de la misma dependencia solicitante, y
-- se compara sin acentos: el mismo nombre aparece capturado como «FISCALÍA» y
-- como «FISCALIA», y con acentos de por medio no se reconocerían como iguales.
CREATE INDEX IF NOT EXISTS idx_oficios_dup_numero
  ON oficios (translate(upper(dependencia_origen), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), numero_normalizado);

CREATE INDEX IF NOT EXISTS idx_oficios_dup_digitos
  ON oficios (translate(upper(dependencia_origen), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), digitos_oficio);

CREATE INDEX IF NOT EXISTS idx_oficios_archivo_hash
  ON oficios (archivo_hash);

COMMENT ON COLUMN oficios.numero_normalizado IS 'Número de oficio sin separadores y en mayúsculas, para comparar duplicados';
COMMENT ON COLUMN oficios.digitos_oficio     IS 'Solo los dígitos del número de oficio, para detectar prefijos mal escritos';
COMMENT ON COLUMN oficios.archivo_hash       IS 'SHA-256 del PDF del oficio: detecta el mismo archivo subido dos veces';
