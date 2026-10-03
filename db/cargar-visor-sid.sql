-- Carga el catálogo del acervo digitalizado del SID en el Visor de PRISMA.
--
-- Hace lo mismo que `db/migrate-visor-sid.mjs`, pero con sentencias de
-- conjunto en vez de renglón por renglón. El script de Node hace tres viajes
-- a la base por archivo: contra producción, al otro lado de la VPN, eso son
-- casi dos millones de idas y vueltas. Aquí el catálogo entra una sola vez a
-- una tabla de paso y el resto se resuelve dentro del servidor.
--
-- ── Lo que NO hace: copiar archivos ────────────────────────────────────────
-- Los PDF se quedan en el recurso compartido del SID. Lo único que se guarda
-- es la ruta relativa al punto de montaje (`/visor_sid/...`), que es como el
-- servicio de imágenes resuelve sus rutas. Son 22.6 GB que no se mueven.
--
-- ── Uso ───────────────────────────────────────────────────────────────────
--   cat visor_pdf_index.csv | psql "$DATABASE_URL" -f db/cargar-visor-sid.sql
--
-- El CSV sale del catálogo del SID con las columnas, en este orden:
--   id_documento, oficina, seccion, tomo, volumen, pagina, version,
--   nombre_archivo, ruta_completa
--
-- IDEMPOTENTE. Cada imagen guarda su `origen_id` (el `id_documento` del SID)
-- y todos los INSERT llevan ON CONFLICT DO NOTHING: volver a correrlo —para
-- traer lo que el SID digitalice después— no duplica nada.

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. Tabla de paso ──────────────────────────────────────────────────────
-- Temporal a propósito: muere con la sesión, así que una corrida interrumpida
-- no deja basura en producción.
CREATE TEMP TABLE sid_carga_visor (
  id_documento   bigint,
  oficina        text,
  seccion        text,
  tomo           text,
  volumen        text,
  pagina         integer,
  version        integer,
  nombre_archivo text,
  ruta_completa  text
) ON COMMIT DROP;

-- PSTDIN y no STDIN: así el CSV se lee de la entrada estándar de psql —el
-- `cat` del comando de arriba— y no de este archivo de script. Entra en un
-- solo flujo, que es justo lo que ahorra el viaje por renglón contra la VPN.
\copy sid_carga_visor FROM PSTDIN WITH (FORMAT csv)

-- ── 2. Normalización ──────────────────────────────────────────────────────
-- Las mismas cuatro reglas que documenta el script de Node:
--
--  · Delegación: en el acervo la carpeta de Cozumel se llama "Cozumel tiff",
--    un resto del proceso de conversión que no tiene por qué llegar a la
--    pantalla.
--
--  · Volumen: en las 5,156 fojas que cuelgan directo del tomo, sin carpeta de
--    volumen, el catálogo del SID guardó ahí el NOMBRE DEL ARCHIVO
--    ("000001.pdf"). Tomarlo al pie de la letra creaba un tomo por archivo:
--    2,501 "tomos" de una sola foja solo en la Sección 5 de Cancún.
--
--  · Versión: el acervo del SID tiene una sola versión activa por foja; el
--    número solo aparece si algún día publican una segunda digitalización.
--
--  · Ruta: se le quita la raíz que usa el SID en su servidor y se le pone el
--    punto de montaje de PRISMA.
--
-- Se descartan los renglones sin sección, tomo, página o ruta: no habría
-- dónde colgar la foja. Al final se reportan.
CREATE TEMP TABLE sid_carga_norm ON COMMIT DROP AS
SELECT
  s.id_documento,
  regexp_replace(btrim(s.oficina), '\s+tiff$', '', 'i')      AS delegacion,
  (regexp_match(s.seccion, '(\d+)'))[1]::int                 AS seccion_num,
  btrim(s.tomo)                                              AS numero_romano,
  CASE
    WHEN coalesce(btrim(s.volumen), '') = ''                              THEN ''
    WHEN btrim(s.volumen) ~* '\.(pdf|tif|tiff|jpg|jpeg|png)$'             THEN ''
    WHEN s.nombre_archivo IS NOT NULL
         AND btrim(s.volumen) = btrim(s.nombre_archivo)                   THEN ''
    ELSE btrim(s.volumen)
  END                                                        AS volumen,
  s.pagina,
  CASE WHEN coalesce(s.version, 1) > 1
       THEN 'V_SID' || s.version
       ELSE 'V_SID' END                                      AS version,
  '/visor_sid' || substring(s.ruta_completa from length('/mnt/direccion_tics/SID') + 1) AS ruta_storage
  FROM sid_carga_visor s
 WHERE s.ruta_completa IS NOT NULL
   AND btrim(coalesce(s.tomo, '')) <> ''
   AND s.pagina IS NOT NULL
   AND (regexp_match(s.seccion, '(\d+)'))[1] IS NOT NULL;

CREATE INDEX ON sid_carga_norm (delegacion, seccion_num, numero_romano, volumen);

-- Una tabla recién creada con CREATE TABLE AS no tiene estadísticas, y sin
-- ellas el planificador calcula a ciegas: la comprobación final de este script
-- —un anti-join de cientos de miles de renglones— llegó a tardar minutos
-- eligiendo un plan malo, lo que desde fuera parece un cuelgue a media carga.
ANALYZE sid_carga_norm;

-- ── 3. Delegaciones ───────────────────────────────────────────────────────
-- Cotejo sin distinguir mayúsculas, para no crear una segunda "Cozumel"
-- junto a la que ya existe.
INSERT INTO visor_delegaciones (nombre, activo)
SELECT DISTINCT n.delegacion, true
  FROM sid_carga_norm n
 WHERE NOT EXISTS (
   SELECT 1 FROM visor_delegaciones d WHERE lower(d.nombre) = lower(n.delegacion));

-- ── 4. Tomos ──────────────────────────────────────────────────────────────
-- La identidad de un tomo del acervo es la combinación completa: la misma
-- "SECCION 4 / CCLXXVI" existe en varias delegaciones.
-- `oficina_codigo` va vacío: las rutas del acervo de libros no llevan código
-- de oficina. La columna existe porque el acervo de inscripciones sí lo
-- necesita para no confundir dos tomos distintos (ver la migración
-- 2026-10-05_visor_inscripciones_sid.sql).
INSERT INTO visor_tomos (delegacion_id, seccion_id, numero_romano, volumen, oficina_codigo)
SELECT DISTINCT d.id, sc.id, n.numero_romano, n.volumen, ''
  FROM sid_carga_norm n
  JOIN visor_delegaciones d ON lower(d.nombre) = lower(n.delegacion)
  JOIN visor_secciones   sc ON sc.numero = n.seccion_num
ON CONFLICT (delegacion_id, seccion_id, numero_romano, volumen, oficina_codigo) DO NOTHING;

-- ── 5. Fojas ──────────────────────────────────────────────────────────────
-- En el acervo el nombre del archivo es el número de página, y una foja es
-- única dentro de su tomo.
INSERT INTO visor_fojas (tomo_id, numero_foja, orden_secuencial)
SELECT DISTINCT t.id, n.pagina::text, n.pagina
  FROM sid_carga_norm n
  JOIN visor_delegaciones d ON lower(d.nombre) = lower(n.delegacion)
  JOIN visor_secciones   sc ON sc.numero = n.seccion_num
  JOIN visor_tomos        t ON t.delegacion_id = d.id
                           AND t.seccion_id    = sc.id
                           AND t.numero_romano = n.numero_romano
                           AND t.volumen       = n.volumen
                           AND t.oficina_codigo = ''
ON CONFLICT (tomo_id, numero_foja) DO NOTHING;

-- ── 6. Imágenes ───────────────────────────────────────────────────────────
INSERT INTO visor_imagenes_foja (foja_id, version, ruta_storage, formato, origen_id)
SELECT f.id, n.version, n.ruta_storage, 'pdf', n.id_documento
  FROM sid_carga_norm n
  JOIN visor_delegaciones d ON lower(d.nombre) = lower(n.delegacion)
  JOIN visor_secciones   sc ON sc.numero = n.seccion_num
  JOIN visor_tomos        t ON t.delegacion_id = d.id
                           AND t.seccion_id    = sc.id
                           AND t.numero_romano = n.numero_romano
                           AND t.volumen       = n.volumen
                           AND t.oficina_codigo = ''
  JOIN visor_fojas        f ON f.tomo_id     = t.id
                           AND f.numero_foja = n.pagina::text
ON CONFLICT (origen_id) DO NOTHING;

-- ── 7. Cuentas ────────────────────────────────────────────────────────────
\echo ''
\echo '── Resultado de la carga ────────────────────────────────────────────'
SELECT
  (SELECT count(*) FROM sid_carga_visor)                        AS renglones_del_csv,
  (SELECT count(*) FROM sid_carga_norm)                         AS aprovechables,
  (SELECT count(*) FROM sid_carga_visor) -
  (SELECT count(*) FROM sid_carga_norm)                         AS descartados,
  (SELECT count(*) FROM visor_delegaciones)                     AS delegaciones,
  (SELECT count(*) FROM visor_tomos)                            AS tomos,
  (SELECT count(*) FROM visor_fojas)                            AS fojas,
  (SELECT count(*) FROM visor_imagenes_foja)                    AS imagenes;

-- Cada archivo del catálogo debe haber quedado registrado. Si esto no da
-- cero, hay renglones aprovechables que no encontraron su foja.
SELECT count(*) AS sin_registrar
  FROM sid_carga_norm n
 WHERE NOT EXISTS (
   SELECT 1 FROM visor_imagenes_foja i WHERE i.origen_id = n.id_documento);

COMMIT;
