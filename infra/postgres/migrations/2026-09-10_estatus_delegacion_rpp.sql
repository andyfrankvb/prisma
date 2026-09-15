-- Agrega estatus y delegación de RPP a satq_lineas_captura, derivados del
-- reporte mvw_reporte_lineas_captura (RPP). Decisiones tomadas con el
-- usuario:
--   1. El KPI principal de conciliación ("conciliado") ahora exige
--      estatus_actual = 'Entrega' — un trámite que solo existe en RPP en
--      una etapa intermedia YA NO cuenta como conciliado.
--   2. No importa la etapa exacta del trámite en RPP: todo lo que no sea
--      'Entrega' ni 'Cancelada por notario' se agrupa como 'En trámite'.
--
-- estatus_actual se deriva así (verificado sobre los datos: 'Entrega' y
-- 'Cancelada por notario' nunca coexisten para el mismo trámite):
--   'Entrega'                si el trámite alcanzó esa etapa
--   'Cancelada por notario'  si no llegó a Entrega pero sí fue cancelado
--   'En trámite'             cualquier otra etapa (Oficialía de partes,
--                            Notario capturista/firmante, Autoridad
--                            capturista, Análisis, Calificación, Delegado)
--
-- El backfill de datos (poblar estas columnas y satq_lineas_captura_resumen
-- desde el volcado de RPP) se hizo aparte con psql directo, igual que la
-- carga original de satq_lineas_captura — esta migración solo deja listo el
-- esquema.

ALTER TABLE satq_lineas_captura ADD COLUMN IF NOT EXISTS estatus_actual varchar(30);
ALTER TABLE satq_lineas_captura ADD COLUMN IF NOT EXISTS delegacion     varchar(60);

CREATE INDEX IF NOT EXISTS idx_slc_estatus_actual ON satq_lineas_captura(estatus_actual);
CREATE INDEX IF NOT EXISTS idx_slc_delegacion      ON satq_lineas_captura(delegacion);

-- Resumen por nolineacaptura (no por trámite): una línea de captura puede
-- reutilizarse en varios trámites a lo largo del tiempo (ver nota en
-- vw_satq_conciliacion), así que para la conciliación de SATQ contra RPP
-- se pregunta "¿existe ESTA línea de captura, con qué estatus, en
-- cualquiera de sus usos?" — igual que ya hacía `conciliado` con EXISTS,
-- solo que ahora clasificado en 4 categorías en vez de sí/no.
CREATE TABLE IF NOT EXISTS satq_lineas_captura_resumen (
  nolineacaptura    varchar(30) PRIMARY KEY,
  tiene_entrega      boolean NOT NULL DEFAULT false,
  tiene_cancelada    boolean NOT NULL DEFAULT false,
  tiene_en_tramite   boolean NOT NULL DEFAULT false,
  delegacion         varchar(60),
  actualizado_en     timestamp NOT NULL DEFAULT now()
);

-- vw_satq_conciliacion: `conciliado` ahora exige estatus_actual='Entrega'
-- (antes bastaba con existir en satq_lineas_captura en cualquier estatus).
-- Se agregan `estatus_conciliacion` (4 categorías) y `delegacion`.
CREATE OR REPLACE VIEW vw_satq_conciliacion AS
SELECT
  i.id,
  i.referencia,
  i.no_operacion,
  i.fecha_contable,
  i.municipio,
  i.id_concepto,
  i.concepto,
  i.importe,
  i.total_referencia,
  COALESCE(c.programa, 'Regular') AS programa,
  COALESCE(c.tipo_acto, 'Sin clasificar') AS tipo_acto,
  (COALESCE(c.es_subsidio, false) OR i.importe < 0) AS es_subsidio,
  COALESCE(r.tiene_entrega, false) AS conciliado,
  CASE
    WHEN r.tiene_entrega    THEN 'Conciliado'
    WHEN r.tiene_cancelada  THEN 'Cancelado en RPP'
    WHEN r.tiene_en_tramite THEN 'En trámite en RPP'
    ELSE 'No ha ingresado a RPP'
  END AS estatus_conciliacion,
  r.delegacion AS delegacion
FROM satq_ingresos i
LEFT JOIN satq_catalogo_conceptos c ON c.id_concepto = i.id_concepto
LEFT JOIN satq_lineas_captura_resumen r ON r.nolineacaptura = i.referencia::text;
