-- Carga el acervo de inscripciones del SID en el Visor de PRISMA.
--
-- Compañero de `db/cargar-visor-sid.sql`, que trae los libros. Esto trae el
-- otro acervo: las 189,793 inscripciones de `sid_inscripciones_control`, que
-- son sobre todo de las secciones Primera y Segunda —justo las que el acervo
-- de libros no cubre— de las cuatro delegaciones.
--
-- ── Lo que NO hace: copiar archivos ────────────────────────────────────────
-- Cada inscripción tiene su PDF en el recurso compartido del SID y ahí se
-- queda. Solo se guarda la ruta relativa al punto de montaje.
--
-- ── Cómo entra al modelo ───────────────────────────────────────────────────
-- Cada inscripción entra como una FOJA con su imagen, y además como un
-- renglón en `visor_inscripciones` que la liga a su tomo y a esa foja. Así
-- reutiliza tal cual el camino que ya funciona y está probado —resolución de
-- versión, marca de agua, dictamen, transcripción— sin modificar una línea
-- del servicio de imágenes. Es el modelo que ya apuntaba la migración
-- original: la inscripción corresponde 1 a 1 con la foja dentro del tomo.
--
-- ── Uso ───────────────────────────────────────────────────────────────────
--   cat inscripciones.csv | psql "$DATABASE_URL" -f db/cargar-visor-inscripciones-sid.sql
--
-- El CSV sale del catálogo del SID con estas columnas, en este orden:
--   id, oficina, tomo, seccion_num, volumen, inscripcion, nombre_destino,
--   ruta_destino_relativa
--
-- Requiere la migración `2026-10-05_visor_inscripciones_sid.sql`.
--
-- IDEMPOTENTE. Cada inscripción guarda su `origen_sid_id` y todos los INSERT
-- llevan ON CONFLICT DO NOTHING.

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. Tabla de paso ──────────────────────────────────────────────────────
CREATE TEMP TABLE sid_carga_insc (
  id                    bigint,
  oficina               text,
  tomo                  text,
  seccion_num           integer,
  volumen               text,
  inscripcion           text,
  nombre_destino        text,
  ruta_destino_relativa text
) ON COMMIT DROP;

\copy sid_carga_insc FROM PSTDIN WITH (FORMAT csv)

-- ── 2. Normalización y elección entre copias ──────────────────────────────
-- Dos cosas que resolver aquí.
--
-- El número de inscripción no siempre es un entero: de las 189,793, hay
-- 16,197 rangos ("0001_1857", un PDF que cubre varias inscripciones) y una con
-- sufijo ("0056b"). Se guarda el número de arranque para ordenar y buscar, el
-- texto literal para mostrar, y el cierre del rango cuando lo hay.
--
-- Y hay 674 asignaciones repetidas: el mismo documento aparece en dos
-- carpetas —550 veces también en `chetumal_abril09/ImgsNotInOracle`, 106 en la
-- carpeta de otra delegación—. Son copias, no inscripciones distintas, y
-- `asignacion` es única, así que hay que elegir. Se elige la de la ruta menos
-- profunda, que es la carpeta propia de la delegación y no un respaldo
-- colgado más abajo; a igualdad, la de menor id. La descartada queda anotada
-- en `observaciones`, para que la decisión sea rastreable y no un renglón
-- perdido.
CREATE TEMP TABLE sid_insc_norm ON COMMIT DROP AS
WITH base AS (
  SELECT
    s.id,
    btrim(s.oficina)                                        AS delegacion,
    s.seccion_num,
    btrim(s.tomo)                                           AS numero_romano,
    coalesce(btrim(s.volumen), '')                          AS volumen,
    btrim(s.inscripcion)                                    AS inscripcion_texto,
    (regexp_match(btrim(s.inscripcion), '^(\d+)'))[1]::int  AS numero_inicial,
    -- Sin ancla de fin a propósito: hay rangos con basura de captura pegada
    -- ("0086_0017___________", "0513_0513_jpg") y exigir fin de cadena dejaba
    -- su cierre en nulo.
    (regexp_match(btrim(s.inscripcion), '^\d+_(\d+)'))[1]::int AS numero_final,
    regexp_replace(btrim(s.nombre_destino), '\.pdf$', '', 'i')  AS asignacion,
    -- El código de oficina, que forma parte de la identidad del tomo: en la
    -- carpeta de Cozumel conviven `12-02-02-01_01-0135.pdf` y
    -- `12-02-04-01_01-0135.pdf`, que son archivos distintos y solo se
    -- diferencian en ese campo.
    --
    -- Se cuenta desde la DERECHA —antepenúltimo segmento— y no desde la
    -- izquierda, porque hay tomos cuyo nombre termina en espacio y producen un
    -- doble guion que corre las posiciones: en `II --02-03-01_01-0081` el
    -- tercer segmento es "02", no la oficina. Contado desde la derecha, la
    -- estructura sí es fija: oficina, volumen, inscripción.
    --
    -- Así extraído coincide con `oficina_codigo` del catálogo en los 189,793
    -- renglones, lo que sirve de comprobación cruzada.
    (string_to_array(regexp_replace(btrim(s.nombre_destino), '\.pdf$', '', 'i'), '-'))
      [array_length(string_to_array(regexp_replace(btrim(s.nombre_destino), '\.pdf$', '', 'i'), '-'), 1) - 2]
      AS oficina_codigo,
    '/visor_sid/' || s.ruta_destino_relativa                AS ruta_storage,
    array_length(string_to_array(s.ruta_destino_relativa, '/'), 1) AS profundidad
    FROM sid_carga_insc s
   WHERE s.ruta_destino_relativa IS NOT NULL
     AND btrim(coalesce(s.tomo, '')) <> ''
     AND s.seccion_num IS NOT NULL
     AND (regexp_match(btrim(coalesce(s.inscripcion, '')), '^(\d+)'))[1] IS NOT NULL
), elegidas AS (
  SELECT b.*,
         row_number() OVER (PARTITION BY b.asignacion ORDER BY b.profundidad, b.id) AS puesto,
         count(*)     OVER (PARTITION BY b.asignacion)                              AS copias,
         first_value(b.ruta_storage) OVER (
           PARTITION BY b.asignacion ORDER BY b.profundidad DESC, b.id DESC)        AS ruta_descartada
    FROM base b
)
SELECT id, delegacion, seccion_num, numero_romano, volumen, oficina_codigo,
       inscripcion_texto, numero_inicial, numero_final, asignacion, ruta_storage, copias,
       CASE WHEN copias > 1 THEN 'Copia descartada en el acervo: ' || ruta_descartada END AS observaciones
  FROM elegidas
 WHERE puesto = 1;

CREATE INDEX ON sid_insc_norm (delegacion, seccion_num, numero_romano, volumen, oficina_codigo);
CREATE INDEX ON sid_insc_norm (asignacion);

-- Sin estadísticas el planificador calcula a ciegas, y la comprobación final
-- —un anti-join contra las 189 mil inscripciones— llegó a tardar minutos
-- eligiendo un plan malo: desde fuera parece un cuelgue a media carga.
ANALYZE sid_insc_norm;

-- ── 3. Delegaciones ───────────────────────────────────────────────────────
-- Las cuatro ya existen por la carga de libros; esto es por si el catálogo de
-- inscripciones nombrara alguna que aquélla no trajo.
INSERT INTO visor_delegaciones (nombre, activo)
SELECT DISTINCT n.delegacion, true
  FROM sid_insc_norm n
 WHERE NOT EXISTS (
   SELECT 1 FROM visor_delegaciones d WHERE lower(d.nombre) = lower(n.delegacion));

-- ── 4. Tomos ──────────────────────────────────────────────────────────────
-- Las secciones Primera y Segunda no tienen ni un tomo en PRISMA: el acervo de
-- libros va de la 3 a la 7. Aquí se crean.
INSERT INTO visor_tomos (delegacion_id, seccion_id, numero_romano, volumen, oficina_codigo)
SELECT DISTINCT d.id, sc.id, n.numero_romano, n.volumen, n.oficina_codigo
  FROM sid_insc_norm n
  JOIN visor_delegaciones d ON lower(d.nombre) = lower(n.delegacion)
  JOIN visor_secciones   sc ON sc.numero = n.seccion_num
ON CONFLICT (delegacion_id, seccion_id, numero_romano, volumen, oficina_codigo) DO NOTHING;

-- ── 5. Fojas ──────────────────────────────────────────────────────────────
-- Una foja por inscripción. `numero_foja` es el nombre literal del acervo
-- ("0078", "0001_1857") y `orden_secuencial` el número de arranque, que es lo
-- que da el orden dentro del tomo. `inscripcion` guarda el mismo texto: es
-- justo para lo que existe esa columna.
INSERT INTO visor_fojas (tomo_id, numero_foja, inscripcion, orden_secuencial)
SELECT t.id, n.inscripcion_texto, n.inscripcion_texto, n.numero_inicial
  FROM sid_insc_norm n
  JOIN visor_delegaciones d ON lower(d.nombre) = lower(n.delegacion)
  JOIN visor_secciones   sc ON sc.numero = n.seccion_num
  JOIN visor_tomos        t ON t.delegacion_id = d.id
                           AND t.seccion_id    = sc.id
                           AND t.numero_romano = n.numero_romano
                           AND t.volumen       = n.volumen
                           AND t.oficina_codigo = n.oficina_codigo
ON CONFLICT (tomo_id, numero_foja) DO NOTHING;

-- ── 6. Imágenes ───────────────────────────────────────────────────────────
-- Ancladas en (foja_id, version) y no en `origen_id`: esa columna ya la ocupa
-- el catálogo de libros y los ids de las inscripciones vuelven a empezar en 1
-- (ver la migración).
INSERT INTO visor_imagenes_foja (foja_id, version, ruta_storage, formato)
SELECT f.id, 'V_SID', n.ruta_storage, 'pdf'
  FROM sid_insc_norm n
  JOIN visor_delegaciones d ON lower(d.nombre) = lower(n.delegacion)
  JOIN visor_secciones   sc ON sc.numero = n.seccion_num
  JOIN visor_tomos        t ON t.delegacion_id = d.id
                           AND t.seccion_id    = sc.id
                           AND t.numero_romano = n.numero_romano
                           AND t.volumen       = n.volumen
                           AND t.oficina_codigo = n.oficina_codigo
  JOIN visor_fojas        f ON f.tomo_id     = t.id
                           AND f.numero_foja = n.inscripcion_texto
ON CONFLICT (foja_id, version) DO NOTHING;

-- ── 7. Inscripciones ──────────────────────────────────────────────────────
INSERT INTO visor_inscripciones (
  origen_sid_id, tomo_id, foja_id, numero_inscripcion,
  numero_inscripcion_texto, numero_final, volumen, asignacion, estatus, observaciones)
SELECT n.id, t.id, f.id, n.numero_inicial,
       n.inscripcion_texto, n.numero_final, n.volumen, n.asignacion, 'OK', n.observaciones
  FROM sid_insc_norm n
  JOIN visor_delegaciones d ON lower(d.nombre) = lower(n.delegacion)
  JOIN visor_secciones   sc ON sc.numero = n.seccion_num
  JOIN visor_tomos        t ON t.delegacion_id = d.id
                           AND t.seccion_id    = sc.id
                           AND t.numero_romano = n.numero_romano
                           AND t.volumen       = n.volumen
                           AND t.oficina_codigo = n.oficina_codigo
  JOIN visor_fojas        f ON f.tomo_id     = t.id
                           AND f.numero_foja = n.inscripcion_texto
ON CONFLICT (asignacion) DO NOTHING;

-- ── 8. Cuentas ────────────────────────────────────────────────────────────
\echo ''
\echo '── Resultado de la carga de inscripciones ───────────────────────────'
SELECT
  (SELECT count(*) FROM sid_carga_insc)                       AS renglones_del_csv,
  (SELECT count(*) FROM sid_insc_norm)                         AS aprovechables,
  (SELECT count(*) FROM sid_carga_insc) -
  (SELECT count(*) FROM sid_insc_norm)                         AS descartados,
  (SELECT count(*) FROM sid_insc_norm WHERE copias > 1)        AS copias_elegidas,
  (SELECT count(*) FROM visor_tomos)                           AS tomos_totales,
  (SELECT count(*) FROM visor_inscripciones)                   AS inscripciones_totales;

-- Esto debe dar cero. Si no, hay inscripciones aprovechables que no quedaron
-- registradas: lo más probable es que su `asignacion` ya la ocupe un renglón
-- del prototipo VISAR.
\echo ''
\echo 'Inscripciones aprovechables que NO quedaron registradas (debe ser 0):'
SELECT count(*) AS sin_registrar
  FROM sid_insc_norm n
 WHERE NOT EXISTS (
   SELECT 1 FROM visor_inscripciones i WHERE i.origen_sid_id = n.id);

-- Si la cuenta de arriba no es cero, esto dice cuáles y por qué.
SELECT n.asignacion, n.ruta_storage
  FROM sid_insc_norm n
 WHERE NOT EXISTS (
   SELECT 1 FROM visor_inscripciones i WHERE i.origen_sid_id = n.id)
 ORDER BY 1
 LIMIT 20;

COMMIT;
