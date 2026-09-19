-- Repuebla las 3 tablas finales de productividad_* desde su staging
-- correspondiente. Correr después de cargar los 3 stg_productividad_* (ver
-- infra/postgres/migrations/2026-09-16_productividad_delegaciones.sql para el
-- porqué de este patrón staging → final).
--
-- Uso: docker compose exec -T db psql -U postgres -d prisma -f /tmp/load_productividad_final.sql
-- (o vía \copy local con este mismo archivo)

BEGIN;

TRUNCATE productividad_ingresos;
INSERT INTO productividad_ingresos
  (nci, fecha_ingreso, delegacion, acto, oficialia, asignado_a, notario, no_notaria, solicitante, folio, tipo_folio, ordinal_proceso, id_usuario, min_fcbit)
SELECT
  nci, fecha_ingreso, delegacion, dsacto, oficialia, asignado_a, notario, no_notaria, solicitante,
  COALESCE(folio_bi, folo_bm, folio_pm, folio_test),
  CASE
    WHEN folio_bi   IS NOT NULL THEN 'BI'
    WHEN folo_bm    IS NOT NULL THEN 'BM'
    WHEN folio_pm   IS NOT NULL THEN 'PM'
    WHEN folio_test IS NOT NULL THEN 'TEST'
  END,
  ordinalprocesoregistral, id_usuario, min_fcbit
FROM stg_productividad_ingresos
WHERE nci IS NOT NULL AND fecha_ingreso IS NOT NULL AND delegacion IS NOT NULL;

TRUNCATE productividad_bandeja;
INSERT INTO productividad_bandeja
  (delegacion, solicitud_id, nci, ejercicio, fecha_ingreso, acto, des_acto, etapa, estatus_solicitud, estatus_acto,
   tipo_acto, fre, dias_en_bandeja, origen, notario, no_notaria, escritura_publica, usuario,
   prelacion, usuario_prelacion, etapa_prelacion, estatus_prelacion)
SELECT
  "Oficina", "Solicitud", "Número de Control Interno", "Ejercicio", "Fecha de ingreso", "Acto ID", "Acto",
  "Etapa", "Estatus Solicitud", "Estatus Acto", "Tipo de Acto", "Folio Real Electrónico", "Días en bandeja",
  "Origen", "Notario", "Notaría", "Escritura Pública", "Usuario",
  "Prelación", "Usuario Prelación", "Etapa Prelación", "Estatus Prelación"
FROM stg_productividad_bandeja
WHERE "Oficina" IS NOT NULL AND "Número de Control Interno" IS NOT NULL AND "Fecha de ingreso" IS NOT NULL;

TRUNCATE productividad_terminados;
INSERT INTO productividad_terminados
  (nci, tipo_solicitud, delegacion, fecha_ingreso, fecha_firma, dias_atencion, acto, etapa, estatus,
   notario, no_notaria, solicitante, usuario_firma, folio, tipo_folio, origen)
SELECT
  nci, tipo_solicitud, delegacion, fecha_ingreso, fecha_firma, dias_atencion, dsacto, etapa, estatus,
  notario, no_notaria, solicitante, usaurio_firma,
  COALESCE(folio_bi, folo_bm, folio_pm, folio_test),
  CASE
    WHEN folio_bi   IS NOT NULL THEN 'BI'
    WHEN folo_bm    IS NOT NULL THEN 'BM'
    WHEN folio_pm   IS NOT NULL THEN 'PM'
    WHEN folio_test IS NOT NULL THEN 'TEST'
  END,
  "Origen"
FROM stg_productividad_terminados
WHERE nci IS NOT NULL AND fecha_ingreso IS NOT NULL AND delegacion IS NOT NULL;

COMMIT;

SELECT 'productividad_ingresos'   AS tabla, count(*) FROM productividad_ingresos
UNION ALL SELECT 'productividad_bandeja',    count(*) FROM productividad_bandeja
UNION ALL SELECT 'productividad_terminados', count(*) FROM productividad_terminados;
