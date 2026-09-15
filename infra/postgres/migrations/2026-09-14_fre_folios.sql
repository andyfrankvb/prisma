-- Reporte FRE (Folio Registral Electrónico) — universo de folios de SIQROO.
--
-- Una sola tabla para los 4 tipos de folio (Inmobiliario, Persona Moral,
-- Testamentos, Bien Mueble), en vez de 4 tablas separadas como en la fuente:
-- así se puede comparar/filtrar entre tipos sin joins, que es justo lo que
-- pide el reporte ejecutivo (universo total por año, tipo y oficina).
--
-- `anio` es el año QUE SÍ SE PUEDE CONFIAR, no necesariamente el de la
-- columna de fecha cruda:
--   - Inmobiliario / Persona Moral / Bien Mueble: año de su fecha real
--     (apertura o constitución) — son confiables.
--   - Testamentos: la fecha de la fuente es un artefacto de carga masiva
--     (miles de filas comparten el mismo timestamp, sin relación con cuándo
--     se creó el testamento) — se usa en su lugar el año embebido en el
--     propio folio (ej. "T20180100000000000019" → 2018), que sí varía y es
--     consistente con el resto del sistema (mismo patrón que nolineacaptura
--     en SATQ: año + oficina + secuencia).
-- `fecha` guarda el dato crudo de la fuente tal cual, para no perderlo, pero
-- el reporte usa `anio` para cualquier tendencia o comparativo interanual.
--
-- Persona Moral: 197 folios traían `fecha_constitucion` genuinamente vacía en
-- la fuente (no un valor inválido, sino NULL) — igual que Testamentos, esos
-- 197 recuperan su año del propio folio (ej. "PM20240200000000000006" →
-- 2024) en vez de quedar sin año. Solo queda 1 folio realmente sin año
-- confiable en todo el universo (un registro de Inmobiliario con fecha
-- placeholder de 1899, sin año utilizable ni en la fecha ni en el folio).
--
-- Los datos (979,252 filas) se cargan aparte con \copy, igual que
-- satq_ingresos/satq_lineas_captura — esta migración solo deja el esquema.

CREATE TABLE IF NOT EXISTS fre_folios (
  id            bigserial PRIMARY KEY,
  fre           varchar(30)  NOT NULL,
  tipo_folio    varchar(20)  NOT NULL,
  oficina       varchar(60)  NOT NULL,
  anio          integer,
  fecha         timestamp,
  razon_social  varchar(300),
  creado_en     timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fre_folios_tipo    ON fre_folios(tipo_folio);
CREATE INDEX IF NOT EXISTS idx_fre_folios_oficina ON fre_folios(oficina);
CREATE INDEX IF NOT EXISTS idx_fre_folios_anio    ON fre_folios(anio);
CREATE INDEX IF NOT EXISTS idx_fre_folios_fre     ON fre_folios(fre);

-- Módulo de reportes: registrar la tarjeta FRE en la misma tabla que ya usa
-- "Conciliación de Ingresos" no aplica aquí — FRE vive dentro del mismo
-- módulo "reportes_satq" (ver migración 2026-09-14_modulo_reportes_generico),
-- no necesita su propio renglón en `modulos`.
