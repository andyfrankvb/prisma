-- Reporte "Productividad por Delegación" — los 3 pilares que Dirección pidió
-- (ingresa / trabajado / pendiente), ahora con datos reales y completos de
-- las 4 delegaciones en vez del ejemplo a mano usado para el esqueleto visual.
--
-- La fuente son las mismas vistas que ya alimentan Superset (ver
-- db/VISTAS_SUPERSET/EXCEL_SUPERSET.xlsx, columna "REPORTE VISTA ESTADISTICA"):
--
--   reporte_oficialia_general   → productividad_ingresos   (lo que entra)
--   mv_bandejas                 → productividad_bandeja    (lo pendiente, foto actual)
--   reporte_ac_terminados_general → productividad_terminados (lo ya trabajado/cerrado)
--
-- Cada vista trae DELEGACIÓN (mv_bandejas la llama "Oficina") — a diferencia
-- del primer ejemplo de "terminados" que nos dieron para el esqueleto, este sí
-- cruza por delegación en las 3 tablas, así que ya no hace falta mostrar
-- "terminados" como universo aparte.
--
-- ── Staging (stg_productividad_*) ──────────────────────────────────────────
-- Reciben el archivo de origen SIN transformar — mismas columnas, mismo
-- nombre y tipo que trae el INSERT de la vista (algunas en español con
-- espacios/acentos, porque así las nombró Superset). Se llenan con
-- TRUNCATE + INSERT en cada carga (manual hoy vía "Carga de Datos"; API de
-- SIQROO más adelante) — mismo patrón que stg_satq_ingresos_carga /
-- stg_estatus_por_tramite. No las consulta el reporte directamente.
--
-- ── Tablas finales (productividad_*) ───────────────────────────────────────
-- Columnas en español→snake_case, folio unificado (folio_bi/folo_bm/folio_pm/
-- folio_test → folio + tipo_folio, igual criterio que actos_rpp con `fre`).
-- Se repueblan desde el staging correspondiente en cada carga (TRUNCATE +
-- INSERT SELECT) — son una FOTO al corte de la carga, no un histórico
-- acumulativo: no se puede fabricar tendencia entre cortes hasta tener varias
-- cargas guardadas (ver conversación del reporte — antigüedad del rezago).

-- ── stg_productividad_ingresos (reporte_oficialia_general) ─────────────────
CREATE TABLE IF NOT EXISTS stg_productividad_ingresos (
  fecha_ingreso            timestamp,
  nci                      text,
  dsacto                   text,
  id_usuario               integer,
  oficialia                text,
  asignado_a               text,
  delegacion               text,
  firma                    text,
  min_fcbit                timestamp,
  ordinalprocesoregistral  integer,
  folio_bi                 text,
  folo_bm                  text,
  folio_pm                 text,
  folio_test               text,
  notario                  text,
  no_notaria               text,
  solicitante              text
);

-- ── stg_productividad_bandeja (mv_bandejas) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS stg_productividad_bandeja (
  "Oficina"                    text,
  "Solicitud"                  bigint,
  "Número de Control Interno"  text,
  "Ejercicio"                  integer,
  "Oficina ID"                 integer,
  "NCI"                        bigint,
  "Fecha de ingreso"           timestamp,
  "Escritura Pública"          text,
  "Notario"                    text,
  "Notaría"                    text,
  "Usuario"                    text,
  "Acto ID"                    text,
  "Acto"                       text,
  "Etapa"                      text,
  "Estatus Solicitud"          text,
  "Estatus Acto"               text,
  "Tipo de Acto"               text,
  "Folio Real Electrónico"     text,
  "Días en bandeja"            integer,
  "Origen"                     text,
  "Prelación"                  text,
  "Usuario Prelación"          text,
  "Etapa Prelación"            text,
  "Estatus Prelación"          text
);

-- ── stg_productividad_terminados (reporte_ac_terminados_general) ───────────
CREATE TABLE IF NOT EXISTS stg_productividad_terminados (
  tipo_solicitud  text,
  fecha_ingreso   timestamp,
  nci             text,
  dsacto          text,
  notario         text,
  no_notaria      text,
  solicitante     text,
  etapa           text,
  estatus         text,
  fecha_firma     timestamp,
  delegacion      text,
  usaurio_firma   text,
  dias_atencion   integer,
  folio_bi        text,
  folo_bm         text,
  folio_pm        text,
  folio_test      text,
  "Origen"        text
);

-- ── productividad_ingresos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productividad_ingresos (
  id                bigserial PRIMARY KEY,
  nci               varchar(30)  NOT NULL,
  fecha_ingreso     timestamp    NOT NULL,
  delegacion        varchar(60)  NOT NULL,
  acto              varchar(150),           -- código + descripción juntos, tal como lo trae dsacto (ej. "BI53 Certificado de Gravamen")
  oficialia         varchar(150),           -- quién lo recibió en oficialía de partes
  asignado_a        varchar(150),           -- analista asignado
  notario           varchar(255),           -- algunos notarios traen razón social larga en vez de solo el nombre
  no_notaria        varchar(20),
  solicitante       varchar(255),
  folio             varchar(30),
  tipo_folio        varchar(10),            -- BI / BM / PM / TEST — de cuál de los 4 folio_* venía lleno
  ordinal_proceso   integer,
  id_usuario        integer,
  min_fcbit         timestamp,
  creado_en         timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prod_ingresos_delegacion    ON productividad_ingresos(delegacion);
CREATE INDEX IF NOT EXISTS idx_prod_ingresos_fecha_ingreso ON productividad_ingresos(fecha_ingreso);
CREATE INDEX IF NOT EXISTS idx_prod_ingresos_nci           ON productividad_ingresos(nci);

-- ── productividad_bandeja (pendiente — foto al corte de la carga) ──────────
CREATE TABLE IF NOT EXISTS productividad_bandeja (
  id                  bigserial PRIMARY KEY,
  delegacion          varchar(60)  NOT NULL,  -- "Oficina" en la fuente
  solicitud_id        bigint       NOT NULL,
  nci                 varchar(30)  NOT NULL,
  ejercicio           integer,
  fecha_ingreso       timestamp    NOT NULL,
  acto                varchar(20),            -- código, ej. "BI1"
  des_acto            varchar(150),           -- descripción, ej. "Traslativo de dominio"
  etapa               varchar(60),
  estatus_solicitud   varchar(80),
  estatus_acto        varchar(80),
  tipo_acto           varchar(60),
  fre                 varchar(30),            -- Folio Real Electrónico
  dias_en_bandeja     integer,                -- ya viene calculado por la fuente
  origen              varchar(60),
  notario             varchar(255),           -- algunos notarios traen razón social larga en vez de solo el nombre
  no_notaria          varchar(20),
  escritura_publica   varchar(60),
  usuario             varchar(150),           -- analista
  prelacion           varchar(60),
  usuario_prelacion   varchar(150),
  etapa_prelacion     varchar(60),
  estatus_prelacion   varchar(80),
  creado_en           timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prod_bandeja_delegacion    ON productividad_bandeja(delegacion);
CREATE INDEX IF NOT EXISTS idx_prod_bandeja_fecha_ingreso ON productividad_bandeja(fecha_ingreso);
CREATE INDEX IF NOT EXISTS idx_prod_bandeja_etapa         ON productividad_bandeja(etapa);
CREATE INDEX IF NOT EXISTS idx_prod_bandeja_nci           ON productividad_bandeja(nci);

-- ── productividad_terminados (trabajado/cerrado — foto al corte de la carga) ──
CREATE TABLE IF NOT EXISTS productividad_terminados (
  id              bigserial PRIMARY KEY,
  nci             varchar(30)  NOT NULL,
  tipo_solicitud  varchar(60),
  delegacion      varchar(60)  NOT NULL,
  fecha_ingreso   timestamp    NOT NULL,
  fecha_firma     timestamp,
  dias_atencion   integer,
  acto            varchar(150),          -- dsacto
  etapa           varchar(60),
  estatus         varchar(60),           -- "Solicitud firmada" / "Rechazado"
  notario         varchar(255),          -- algunos notarios traen razón social larga en vez de solo el nombre
  no_notaria      varchar(20),
  solicitante     varchar(255),
  usuario_firma   varchar(150),
  folio           varchar(30),
  tipo_folio      varchar(10),
  origen          varchar(60),
  creado_en       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prod_terminados_delegacion  ON productividad_terminados(delegacion);
CREATE INDEX IF NOT EXISTS idx_prod_terminados_fecha_firma ON productividad_terminados(fecha_firma);
CREATE INDEX IF NOT EXISTS idx_prod_terminados_estatus     ON productividad_terminados(estatus);
CREATE INDEX IF NOT EXISTS idx_prod_terminados_nci         ON productividad_terminados(nci);

-- Viven dentro del módulo "reportes_satq" (mismo que Conciliación de Ingresos,
-- FRE y Actos) — no necesitan su propio renglón en `modulos`.
