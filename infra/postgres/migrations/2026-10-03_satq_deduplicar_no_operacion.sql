-- Corrige duplicados en satq_ingresos: la carga de Excel guardó el mismo
-- no_operacion con y sin cero inicial ('08010141738344' vs '8010141738344'), y
-- la llave única (no_operacion, id_concepto) no los detectaba. Efecto: el
-- ingreso y el subsidio de 2026 salían inflados (jul-2026: $92.48M vs $68.67M
-- de SATQ; subsidio $46.11M vs $40.41M). Con esta depuración cuadran exacto.
--
-- Se conserva la fila SIN cero inicial (formato de 2025) y se elimina su gemela.
-- Idempotente. Respaldar satq_ingresos antes de aplicar en producción.

DELETE FROM satq_ingresos z
 USING satq_ingresos k
 WHERE z.no_operacion LIKE '0%'
   AND k.no_operacion = ltrim(z.no_operacion, '0')
   AND k.id_concepto  = z.id_concepto
   AND k.id <> z.id;

-- Filas con cero inicial que no tenían gemela: se normalizan.
UPDATE satq_ingresos SET no_operacion = ltrim(no_operacion, '0') WHERE no_operacion LIKE '0%';
