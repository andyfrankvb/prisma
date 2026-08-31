-- Vista para auditar la numeración de folios: ¿falta algún consecutivo?
--
-- Desde que el número se toma dentro de la misma transacción que guarda el
-- oficio, un fallo posterior revierte el contador y no debería quedar hueco. Pero
-- «no debería» no es «no puede»: un apagón entre el commit del contador y el del
-- oficio, una intervención manual sobre la tabla, o un borrado posterior de un
-- oficio dejarían un número sin dueño. Este es el modo de enterarse.
--
-- El orden REAL de entrada no depende de esta vista: `oficios.fecha_registro`
-- guarda el instante de cada captura, así que la secuencia de llegada siempre se
-- puede reconstruir aunque el consecutivo tuviera un salto.
--
-- ── Cómo se lee el folio ─────────────────────────────────────────────────────
--
-- Los folios nuevos son {ÁREA}-{DD_MM_AAAA}-{NNNN}, así que el consecutivo es el
-- tercer segmento y la fecha el segundo.
--
-- Los anteriores (OF-26082026-DG-0004) quedan fuera a propósito: su numeración
-- era POR ÁREA, de modo que en un mismo día había varios «0001» y esta vista los
-- reportaría como huecos que nunca existieron.
--
-- ── Uso ──────────────────────────────────────────────────────────────────────
--
--   SELECT * FROM folios_huecos ORDER BY fecha DESC;
--   SELECT * FROM folios_huecos WHERE fecha = '2026-08-29';
--
-- Sin filas = no falta ningún consecutivo.

CREATE OR REPLACE VIEW folios_huecos AS
WITH nuevos AS (
  SELECT to_date(split_part(folio, '-', 2), 'DD_MM_YYYY') AS fecha,
         split_part(folio, '-', 3)::int                   AS numero
    FROM oficios
   WHERE folio NOT LIKE 'OF-%'                 -- solo la nomenclatura nueva
     AND split_part(folio, '-', 3) ~ '^[0-9]+$'
)
SELECT s.fecha,
       g.numero AS consecutivo_faltante
  FROM folio_secuencia s
  CROSS JOIN LATERAL generate_series(1, s.ultimo) AS g(numero)
 WHERE EXISTS (SELECT 1 FROM nuevos n WHERE n.fecha = s.fecha)   -- días ya con folio nuevo
   AND NOT EXISTS (SELECT 1 FROM nuevos n WHERE n.fecha = s.fecha AND n.numero = g.numero);

COMMENT ON VIEW folios_huecos IS
  'Consecutivos de folio que el contador entregó pero que ningún oficio conserva. Sin filas = numeración completa.';
