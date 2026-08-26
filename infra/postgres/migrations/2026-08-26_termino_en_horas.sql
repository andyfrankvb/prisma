-- Término del oficio medido en horas, además de por fecha.
--
-- Hay asuntos que no se miden en días: una autoridad pide algo para dentro de
-- seis horas y capturarlo como «vence hoy» no dice lo mismo ni prende el
-- semáforo a tiempo.
--
-- Se guarda cómo se capturó (`termino_tipo`) y, cuando son horas, cuántas
-- (`termino_horas`, de 1 a 24). La fecha de vencimiento existente no se toca:
-- sigue siendo el dato que se captura cuando el término va por fecha.
--
-- `vence_en` es el instante exacto en que se agota el plazo, y de ahí leen el
-- semáforo, los filtros de vencidos y el orden por término. Es una columna
-- GENERADA a propósito: se calcula sola a partir de los otros campos, así que no
-- puede quedar desfasada si algún día se edita el término desde otro lugar.
--
--   · por horas → desde que ingresó el oficio, más las horas capturadas
--   · por fecha → el final de ese día, no su medianoche: un oficio que vence
--     hoy sigue vigente durante todo el día de hoy

ALTER TABLE oficios
  ADD COLUMN IF NOT EXISTS termino_tipo  varchar(6),
  ADD COLUMN IF NOT EXISTS termino_horas smallint;

ALTER TABLE oficios DROP CONSTRAINT IF EXISTS chk_termino_tipo;
ALTER TABLE oficios
  ADD CONSTRAINT chk_termino_tipo
  CHECK (termino_tipo IS NULL OR termino_tipo IN ('FECHA', 'HORAS'));

ALTER TABLE oficios DROP CONSTRAINT IF EXISTS chk_termino_horas;
ALTER TABLE oficios
  ADD CONSTRAINT chk_termino_horas
  CHECK (termino_horas IS NULL OR (termino_horas BETWEEN 1 AND 24));

-- Todo lo que ya está capturado tiene término por fecha: se deja dicho, para que
-- no queden registros sin tipo y la pantalla sepa cómo mostrarlos. La fecha ya
-- estaba guardada, así que no hay nada que recalcular.
UPDATE oficios
   SET termino_tipo = 'FECHA'
 WHERE tiene_termino
   AND termino_tipo IS NULL;

ALTER TABLE oficios DROP COLUMN IF EXISTS vence_en;
ALTER TABLE oficios
  ADD COLUMN vence_en timestamp
  GENERATED ALWAYS AS (
    CASE
      WHEN NOT tiene_termino THEN NULL
      WHEN termino_tipo = 'HORAS' AND termino_horas IS NOT NULL
        THEN fecha_registro + make_interval(hours => termino_horas::int)
      WHEN fecha_vencimiento IS NOT NULL
        THEN fecha_vencimiento::timestamp + interval '23 hours 59 minutes 59 seconds'
      ELSE NULL
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS ix_oficios_vence_en ON oficios (vence_en) WHERE vence_en IS NOT NULL;
