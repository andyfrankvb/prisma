-- Fix: vw_satq_conciliacion.es_subsidio no detectaba subsidios cuyo id_concepto
-- no está catalogado como subsidio pero cuyo importe SÍ es negativo (la
-- convención documentada de la fuente: un subsidio descuenta el cargo
-- original con un renglón de importe negativo).
--
-- Caso real que lo destapó: id_concepto 204 ("19.28 Fojas del documento
-- incluyendo anexos") es casi siempre un cobro regular positivo, pero 37
-- filas de 2026 (8 de ellas en febrero) tienen ese mismo id_concepto con
-- importe negativo — son subsidios reales que la clasificación por catálogo
-- (estática, por id_concepto) no puede distinguir de las filas regulares del
-- mismo concepto. Un caso similar aparece en id_concepto 370 (1 fila).
--
-- No se puede arreglar marcando id_concepto=204 como es_subsidio=true en el
-- catálogo porque eso reclasificaría también las filas positivas legítimas
-- (el cobro normal por fojas). La corrección correcta es a nivel de fila:
-- es_subsidio = catálogo OR importe < 0.

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
  EXISTS (
    SELECT 1 FROM satq_lineas_captura l WHERE l.nolineacaptura::text = i.referencia::text
  ) AS conciliado
FROM satq_ingresos i
LEFT JOIN satq_catalogo_conceptos c ON c.id_concepto = i.id_concepto;
