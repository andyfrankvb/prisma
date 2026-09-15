-- Reclasifica 5 programas que estaban escondidos dentro de "Regular" en
-- satq_catalogo_conceptos — el texto del concepto los nombra entre paréntesis
-- (ej. "...(Regularización para el bienestar patrimonial en los municipios)")
-- pero el clasificador automático original no los reconoció como programa
-- aparte. Deja sin separar "Programa Atención a las Causas" y "RRAJA" (1-2
-- filas cada uno, sin aporte real al desglose).

UPDATE satq_catalogo_conceptos c SET programa = 'Regularización Bienestar Patrimonial'
FROM (SELECT DISTINCT id_concepto FROM satq_ingresos WHERE concepto ILIKE '%Regularización para el bienestar patrimonial%') x
WHERE c.id_concepto = x.id_concepto;

UPDATE satq_catalogo_conceptos c SET programa = 'Acciones Urbanísticas y Vivienda Social'
FROM (SELECT DISTINCT id_concepto FROM satq_ingresos WHERE concepto ILIKE '%Acciones Urbanísticas y Produccion de Vivienda Social%') x
WHERE c.id_concepto = x.id_concepto;

UPDATE satq_catalogo_conceptos c SET programa = 'Regulariza Tu Propiedad'
FROM (SELECT DISTINCT id_concepto FROM satq_ingresos WHERE concepto ILIKE '%Regulariza%Tu%Propiedad%' OR concepto ILIKE '%Regulariza tu Propiedad%') x
WHERE c.id_concepto = x.id_concepto;

UPDATE satq_catalogo_conceptos c SET programa = 'PAE RPP SATQ'
FROM (SELECT DISTINCT id_concepto FROM satq_ingresos WHERE concepto ILIKE '%PAE RPP SATQ%') x
WHERE c.id_concepto = x.id_concepto;

UPDATE satq_catalogo_conceptos c SET programa = 'RPP RAN'
FROM (SELECT DISTINCT id_concepto FROM satq_ingresos WHERE concepto ILIKE '%RPP RAN%') x
WHERE c.id_concepto = x.id_concepto;
