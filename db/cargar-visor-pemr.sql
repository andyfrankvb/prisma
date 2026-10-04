-- Carga una campaña PEMR en el Visor.
--
-- Tercero de la familia, después de `cargar-visor-sid.sql` (los libros) y
-- `cargar-visor-inscripciones-sid.sql` (las inscripciones del SID). Este trae
-- las campañas nuevas de digitalización, que a diferencia de aquéllas no vienen
-- de un catálogo en una base sino de listados en Excel del proveedor: por eso
-- el CSV lo arma antes `db/preparar-listados-pemr.mjs`.
--
-- ── Lo que NO hace: copiar archivos ───────────────────────────────────────
-- Los PDF se quedan en el recurso compartido. Solo se guarda la ruta relativa
-- al punto de montaje.
--
-- ── Cómo convive con lo que ya está ───────────────────────────────────────
-- Una campaña NO reemplaza a la anterior: la complementa. En el tomo I volumen
-- 01_02 de Cozumel, la primera digitalización dejó 21 documentos y PEMR 2025
-- trae 81; 14 están en ambas, 7 solo en la primera y 67 solo en la nueva.
--
-- Por eso la inscripción sigue siendo UNA —un acto registral, un renglón en
-- `visor_inscripciones`— y lo que se multiplica es la IMAGEN: una por campaña,
-- colgando de la misma foja. Así el usuario ve el tomo completo y, al abrir un
-- documento que existe en varias campañas, elige cuál consultar con el selector
-- que ya existe, y Jurídico dictamina cuál es la válida.
--
-- ── Uso ──────────────────────────────────────────────────────────────────
--   node db/preparar-listados-pemr.mjs --listados … --lista … --prefijo … --salida /tmp/pemr2025.csv
--   cat /tmp/pemr2025.csv | psql "$DATABASE_URL" -f db/cargar-visor-pemr.sql
--
-- Columnas del CSV, en este orden:
--   campania, asignacion, tomo, volumen, estatus, observaciones, ruta_storage
--
-- La campaña viaja en el CSV y no como variable de psql: zsh se come los
-- argumentos de la forma `-v nombre=valor` y el cargador se quedaba sin saber
-- qué estaba cargando, fallando de forma muy opaca.
--
-- Requiere la migración `2026-10-07_visor_campanias.sql`.
--
-- IDEMPOTENTE: todos los INSERT llevan ON CONFLICT DO NOTHING.

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. Tabla de paso ──────────────────────────────────────────────────────
CREATE TEMP TABLE pemr_carga (
  campania      text,
  asignacion    text,
  tomo          text,
  volumen       text,
  estatus       text,
  observaciones text,
  ruta_storage  text
) ON COMMIT DROP;

\copy pemr_carga FROM PSTDIN WITH (FORMAT csv)

-- Un CSV trae una sola campaña, y tiene que existir en el catálogo antes de
-- colgarle nada. Si no, se detiene aquí en vez de cargar con una clave que
-- después nadie sabría nombrar en pantalla.
DO $$
DECLARE faltan text;
BEGIN
  SELECT string_agg(DISTINCT p.campania, ', ') INTO faltan
    FROM pemr_carga p
   WHERE NOT EXISTS (SELECT 1 FROM visor_campanias c WHERE c.clave = p.campania);
  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Campaña no registrada en visor_campanias: %', faltan;
  END IF;
END $$;

-- ── 2. Normalización ──────────────────────────────────────────────────────
-- `tomo` y `volumen` se toman del listado del proveedor, que los trae en
-- columnas propias y limpias. Lo demás sale de la asignación y de la ruta:
--
--  · Sección: segundo segmento de la asignación.
--
--  · Oficina: antepenúltimo, contado desde la DERECHA. Desde la izquierda no
--    sirve: hay tomos cuyo nombre termina en espacio y producen un doble guion
--    que corre las posiciones (`II --02-03-01_01-0081`). Forma parte de la
--    identidad del tomo porque en una misma carpeta conviven documentos de
--    oficinas distintas con el mismo número romano.
--
--  · Inscripción: último segmento, literal. Puede ser un número ("0007"), un
--    rango cuando un PDF cubre varias ("0003_0006") o traer sufijo de variante
--    ("0513_0513_jpg"): se guarda tal cual, porque recortarlo fundiría archivos
--    distintos en uno.
--
--  · Delegación: de la RUTA, no de la oficina. El proveedor organiza su entrega
--    por delegación y es la carpeta la que manda sobre dónde vive el documento.
CREATE TEMP TABLE pemr_norm ON COMMIT DROP AS
SELECT
  p.campania,
  p.asignacion,
  btrim(p.tomo)                                                   AS numero_romano,
  coalesce(btrim(p.volumen), '')                                  AS volumen,
  (regexp_match(p.asignacion, '^[^-]*-([0-9]+)-'))[1]::int        AS seccion_num,
  (string_to_array(p.asignacion, '-'))[array_length(string_to_array(p.asignacion, '-'), 1) - 2] AS oficina_codigo,
  (string_to_array(p.asignacion, '-'))[array_length(string_to_array(p.asignacion, '-'), 1)]     AS inscripcion_texto,
  substring(p.ruta_storage from '(?:Inscripciones|Libros)/([^/]+)/') AS delegacion,
  nullif(btrim(p.estatus), '')                                    AS estatus,
  nullif(btrim(p.observaciones), '')                              AS observaciones,
  p.ruta_storage,
  -- Si la inscripción ya existe de otra campaña, se reusa SU foja y no se
  -- recalcula dónde debería ir.
  --
  -- Hace falta porque las dos campañas no siempre coinciden en la delegación.
  -- `X-01-04-01_02-0016` está en PRISMA bajo Playa del Carmen —así lo clasificó
  -- el catálogo del SID— aunque su nombre diga oficina 04, que es Cozumel, y el
  -- proveedor lo entregue en la carpeta de Cozumel. Sin esto se crearía un
  -- segundo tomo y el mismo documento quedaría partido en dos delegaciones en
  -- vez de ganar una versión.
  (SELECT ins.foja_id FROM visor_inscripciones ins WHERE ins.asignacion = p.asignacion) AS foja_existente
  FROM pemr_carga p
 WHERE p.ruta_storage IS NOT NULL
   AND btrim(coalesce(p.tomo, '')) <> ''
   AND (regexp_match(p.asignacion, '^[^-]*-([0-9]+)-'))[1] IS NOT NULL;

ANALYZE pemr_norm;

-- ── 3. Delegaciones y tomos ───────────────────────────────────────────────
INSERT INTO visor_delegaciones (nombre, activo)
SELECT DISTINCT n.delegacion, true
  FROM pemr_norm n
 WHERE n.delegacion IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM visor_delegaciones d WHERE lower(d.nombre) = lower(n.delegacion));

INSERT INTO visor_tomos (delegacion_id, seccion_id, numero_romano, volumen, oficina_codigo)
SELECT DISTINCT d.id, sc.id, n.numero_romano, n.volumen, n.oficina_codigo
  FROM pemr_norm n
  JOIN visor_delegaciones d ON lower(d.nombre) = lower(n.delegacion)
  JOIN visor_secciones   sc ON sc.numero = n.seccion_num
 WHERE n.foja_existente IS NULL
ON CONFLICT (delegacion_id, seccion_id, numero_romano, volumen, oficina_codigo) DO NOTHING;

-- ── 4. Fojas ──────────────────────────────────────────────────────────────
-- Una foja por inscripción. Si la inscripción ya existía de otra campaña, esta
-- no crea una nueva: se cuelga de la misma, que es justo lo que hace posible
-- comparar las dos versiones del mismo documento.
INSERT INTO visor_fojas (tomo_id, numero_foja, inscripcion, orden_secuencial)
SELECT t.id, n.inscripcion_texto, n.inscripcion_texto,
       coalesce((regexp_match(n.inscripcion_texto, '^(\d+)'))[1]::int, 0)
  FROM pemr_norm n
  JOIN visor_delegaciones d ON lower(d.nombre) = lower(n.delegacion)
  JOIN visor_secciones   sc ON sc.numero = n.seccion_num
  JOIN visor_tomos        t ON t.delegacion_id  = d.id
                           AND t.seccion_id     = sc.id
                           AND t.numero_romano  = n.numero_romano
                           AND t.volumen        = n.volumen
                           AND t.oficina_codigo = n.oficina_codigo
 WHERE n.foja_existente IS NULL
ON CONFLICT (tomo_id, numero_foja) DO NOTHING;

-- ── 5. Imágenes ───────────────────────────────────────────────────────────
-- Aquí entra la campaña, y con ella la calidad que reporta el proveedor.
INSERT INTO visor_imagenes_foja (foja_id, version, ruta_storage, formato, estatus, observaciones)
SELECT coalesce(n.foja_existente, f.id), n.campania, n.ruta_storage, 'pdf', n.estatus, n.observaciones
  FROM pemr_norm n
  LEFT JOIN visor_delegaciones d ON lower(d.nombre) = lower(n.delegacion)
  LEFT JOIN visor_secciones   sc ON sc.numero = n.seccion_num
  LEFT JOIN visor_tomos        t ON t.delegacion_id  = d.id
                                AND t.seccion_id     = sc.id
                                AND t.numero_romano  = n.numero_romano
                                AND t.volumen        = n.volumen
                                AND t.oficina_codigo = n.oficina_codigo
  LEFT JOIN visor_fojas        f ON f.tomo_id     = t.id
                                AND f.numero_foja = n.inscripcion_texto
 WHERE coalesce(n.foja_existente, f.id) IS NOT NULL
ON CONFLICT (foja_id, version) DO NOTHING;

-- ── 6. Inscripciones ──────────────────────────────────────────────────────
-- Solo las que no existían. Las que ya estaban conservan su renglón: lo que
-- ganaron es una imagen más.
INSERT INTO visor_inscripciones (
  tomo_id, foja_id, numero_inscripcion, numero_inscripcion_texto, numero_final,
  volumen, asignacion, estatus)
SELECT t.id, f.id,
       coalesce((regexp_match(n.inscripcion_texto, '^(\d+)'))[1]::int, 0),
       n.inscripcion_texto,
       (regexp_match(n.inscripcion_texto, '^\d+_(\d+)'))[1]::int,
       n.volumen, n.asignacion, 'OK'
  FROM pemr_norm n
  JOIN visor_delegaciones d ON lower(d.nombre) = lower(n.delegacion)
  JOIN visor_secciones   sc ON sc.numero = n.seccion_num
  JOIN visor_tomos        t ON t.delegacion_id  = d.id
                           AND t.seccion_id     = sc.id
                           AND t.numero_romano  = n.numero_romano
                           AND t.volumen        = n.volumen
                           AND t.oficina_codigo = n.oficina_codigo
  JOIN visor_fojas        f ON f.tomo_id     = t.id
                           AND f.numero_foja = n.inscripcion_texto
 WHERE n.foja_existente IS NULL
ON CONFLICT (asignacion) DO NOTHING;

-- ── 7. Cuentas ────────────────────────────────────────────────────────────
\echo ''
\echo '── Resultado de la carga ────────────────────────────────────────────'
SELECT
  (SELECT count(*) FROM pemr_carga)                                       AS renglones_del_csv,
  (SELECT count(*) FROM pemr_norm)                                        AS aprovechables,
  (SELECT count(*) FROM visor_imagenes_foja
    WHERE version IN (SELECT DISTINCT campania FROM pemr_carga))               AS imagenes_de_la_campania,
  (SELECT count(*) FROM visor_tomos)                                      AS tomos_totales,
  (SELECT count(*) FROM visor_inscripciones)                              AS inscripciones_totales;

\echo ''
\echo 'Documentos del CSV que NO quedaron registrados (debe ser 0):'
SELECT count(*) AS sin_registrar
  FROM pemr_norm n
 WHERE NOT EXISTS (
   SELECT 1 FROM visor_imagenes_foja i
    WHERE i.version = n.campania AND i.ruta_storage = n.ruta_storage);

\echo ''
\echo 'Inscripciones que ahora existen en más de una campaña:'
SELECT count(*) AS en_varias_campanias FROM (
  SELECT f.id FROM visor_fojas f
    JOIN visor_imagenes_foja i ON i.foja_id = f.id
   GROUP BY f.id HAVING count(DISTINCT i.version) > 1) x;

COMMIT;
