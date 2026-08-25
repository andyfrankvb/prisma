-- Pase de firma a la Dirección General.
--
-- Hay oficios que un área trabaja y aprueba, pero que firma la Directora General y
-- no el titular del área, porque la firma delegada no alcanza ese tema. Hasta ahora
-- eso solo podía imitarse turnando el oficio por competencia, lo que reiniciaba su
-- trámite y dejaba asentado que el asunto no le correspondía al área — justo lo
-- contrario de lo que ocurre.
--
-- El pase NO cambia a quién va dirigido el oficio: el destinatario es un dato del
-- documento que se recibió y no se reescribe nunca. Solo se registra que está
-- esperando firma, y de ahí se resuelve quién puede cerrarlo y en qué bandeja se
-- muestra. Por eso el área que lo mandó lo sigue viendo en su lista.
--
-- Es una tabla y no una marca en el oficio porque el pase es de ida y vuelta: la
-- Directora puede regresarlo a corregir, y entonces el oficio va y vuelve varias
-- veces. Cada viaje queda con su fecha, su autor y su desenlace.

CREATE TABLE IF NOT EXISTS oficio_pases_firma (
  id              serial      PRIMARY KEY,
  oficio_id       integer     NOT NULL REFERENCES oficios(id)  ON UPDATE CASCADE ON DELETE CASCADE,
  enviado_por_id  integer     NOT NULL REFERENCES usuarios(id),
  enviado_en      timestamptz NOT NULL DEFAULT now(),
  cerrado_en      timestamptz,
  cerrado_por_id  integer     REFERENCES usuarios(id),
  -- FIRMADO: la Dirección General lo firmó. CORREGIR: lo regresó al área.
  resultado       varchar(12),
  -- Dos motivos distintos y por eso dos columnas: por qué el área lo mandó a
  -- firma, y por qué la Dirección General lo regresó. Con una sola, la vuelta
  -- pisaba la ida y la línea de tiempo contaba mal el viaje.
  motivo          text,
  motivo_cierre   text,
  CONSTRAINT chk_pase_firma_resultado
    CHECK (resultado IS NULL OR resultado IN ('FIRMADO', 'CORREGIR'))
);

-- Un oficio no puede estar esperando dos firmas a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pase_firma_abierto
  ON oficio_pases_firma (oficio_id)
  WHERE cerrado_en IS NULL;

CREATE INDEX IF NOT EXISTS ix_pase_firma_oficio
  ON oficio_pases_firma (oficio_id);
