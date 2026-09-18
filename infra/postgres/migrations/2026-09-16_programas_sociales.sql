-- Puente Programas Sociales: liga cada trámite RPP (productividad_ingresos /
-- _bandeja / _terminados, columna `nci`) con el programa de SATQ al que
-- pertenece (satq_catalogo_conceptos.programa), pasando por la línea de
-- captura — igual que ya hace `vw_satq_conciliacion` para el lado del dinero.
--
--   satq_ingresos.referencia = satq_lineas_captura.nolineacaptura
--   satq_lineas_captura.dsnci = productividad_*.nci
--
-- Validado contra la base real (ver análisis en el chat): de 774,189 líneas
-- de captura con dsnci, 742,616 (96%) coinciden con un nci en
-- productividad_terminados y 765,069 (99%) en productividad_ingresos.
--
-- La columna se llama `nci_rpp` (no `nci`) a propósito: así los JOIN contra
-- productividad_ingresos/_bandeja/_terminados no generan ambigüedad de
-- nombre de columna y el resto del SQL puede seguir usando `nci` sin prefijo.
--
-- Se excluye programa = 'Regular' (no es un programa social, es todo lo que
-- no tiene programa asignado en el catálogo). Un mismo nci puede aparecer con
-- más de un programa si el trámite tuvo líneas de captura de ambos — pasa en
-- 495 de ~55,000 combinaciones (<1%), ruido aceptable, igual que el caso BI53
-- en la categoría certificación/inscripción.
CREATE TABLE IF NOT EXISTS programa_nci (
  programa  varchar(60) NOT NULL,
  nci_rpp   varchar(30) NOT NULL,
  PRIMARY KEY (programa, nci_rpp)
);

CREATE INDEX IF NOT EXISTS idx_programa_nci_nci_rpp ON programa_nci(nci_rpp);

TRUNCATE programa_nci;
INSERT INTO programa_nci (programa, nci_rpp)
SELECT DISTINCT c.programa, l.dsnci
FROM satq_lineas_captura l
JOIN satq_ingresos i ON i.referencia = l.nolineacaptura
JOIN satq_catalogo_conceptos c ON c.id_concepto = i.id_concepto
WHERE c.programa <> 'Regular' AND l.dsnci IS NOT NULL AND l.dsnci <> '';
