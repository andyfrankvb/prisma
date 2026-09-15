-- Reporte "Universo de Actos Registrales" — todos los actos (trámites) que se
-- han registrado en la historia del RPPC: Inmobiliario, Persona Moral,
-- Testamentos y Bienes Muebles. Una tabla para los 4, igual que fre_folios,
-- por la misma razón: comparar/filtrar entre tipos sin joins.
--
-- Un ACTO no es lo mismo que un FOLIO (fre_folios): un folio es el expediente
-- (una propiedad, una persona moral...); un acto es cada trámite que le pasa
-- a lo largo de su vida (primera inscripción, gravamen, cancelación de
-- gravamen...). Un folio puede tener muchos actos. `fre` conecta ambas tablas.
--
-- ── El hallazgo de "actos de acervo registral" ────────────────────────────
--
-- 1,265,441 de los 5,499,192 actos (23%) traen `fecha_registro = 1900-01-01`
-- —el placeholder de "sin fecha capturada" del sistema origen— y hay un
-- puñado más (<30) con fechas absurdas (año 2, 1672, 1858...). Se confirmó
-- con Dirección que esto no es basura: son actos de ACERVO REGISTRAL —trámites
-- históricos que se fueron cargando/migrando poco a poco al sistema, de ahí
-- que su fecha de captura no refleje cuándo ocurrió el acto realmente—, igual
-- que cualquier otro acto con año menor a 2004. 2004 en adelante sí es
-- registro en tiempo real y su fecha es confiable.
--
-- Por eso `es_acervo` no es una bandera de "dato roto que se descarta": es
-- una categoría de negocio que el reporte muestra explícitamente (KPI propio,
-- filtro propio), y la tendencia anual solo grafica 2004+ para no meter un
-- pico falso de 1.2M actos en el año 1900.
--
-- `anio` se guarda tal cual se extrae de fecha_registro (aunque sea
-- disparatado, ej. año 2) para no perder trazabilidad al hacer drill-down;
-- `es_acervo` es la columna que el reporte usa para decidir qué mostrar.
--
-- `tipo_tramite` se deriva del prefijo del código de acto al cargar los datos
-- (BI→Inmobiliario, PM→Persona Moral, T→Testamentos, BM→Bien Mueble) para no
-- repetir ese cómputo en cada consulta sobre 5.5M de filas.
--
-- Los datos (5,499,192 filas) se cargan aparte con \copy, igual que
-- satq_ingresos/fre_folios — esta migración solo deja el esquema.

CREATE TABLE IF NOT EXISTS actos_rpp (
  id              bigserial PRIMARY KEY,
  id_origen       bigint,                 -- llsolfrmpre de la fuente, sin garantía de unicidad verificada a esta escala
  acto            varchar(10)  NOT NULL,
  des_acto        varchar(150) NOT NULL,
  tipo_tramite    varchar(20)  NOT NULL,
  fecha_registro  timestamp,
  anio            integer,
  es_acervo       boolean      NOT NULL DEFAULT false,
  oficina         varchar(60),
  fre             varchar(30),
  estatus_acto    varchar(80),
  creado_en       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actos_rpp_acto         ON actos_rpp(acto);
CREATE INDEX IF NOT EXISTS idx_actos_rpp_tipo_tramite  ON actos_rpp(tipo_tramite);
CREATE INDEX IF NOT EXISTS idx_actos_rpp_oficina       ON actos_rpp(oficina);
CREATE INDEX IF NOT EXISTS idx_actos_rpp_anio          ON actos_rpp(anio);
CREATE INDEX IF NOT EXISTS idx_actos_rpp_es_acervo     ON actos_rpp(es_acervo);
CREATE INDEX IF NOT EXISTS idx_actos_rpp_fre           ON actos_rpp(fre);
CREATE INDEX IF NOT EXISTS idx_actos_rpp_estatus_acto  ON actos_rpp(estatus_acto);

-- Vive dentro del módulo "reportes_satq" (mismo que Conciliación de Ingresos
-- y FRE) — no necesita su propio renglón en `modulos`.
