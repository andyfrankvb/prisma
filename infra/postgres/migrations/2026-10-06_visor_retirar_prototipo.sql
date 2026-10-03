-- Retira del Visor los datos de prueba del prototipo VISAR.
--
-- El módulo nació con datos sembrados desde VISAR: 1 delegación, 5 tomos,
-- 3,483 fojas y 434 inscripciones, importados con
-- `db/import-visor-visar-testdata.mjs`. Ya cumplieron su función: el acervo
-- real del SID está cargado (638,171 libros, y las inscripciones en camino).
--
-- ── Por qué retirarlos y no dejarlos conviviendo ───────────────────────────
--
-- 1. No muestran nada. Sus imágenes apuntan a
--    `/visor_documentos/importado_visar/...`, una carpeta que NO EXISTE en el
--    almacenamiento de producción —verificado el 2026-10-02 desde el
--    contenedor—. Son 3,483 fojas que al abrirse fallan.
--
-- 2. Bloquean 55 documentos reales. `visor_inscripciones.asignacion` es única,
--    y 55 de las 434 del prototipo ocupan el nombre de inscripciones que sí
--    existen en el acervo del SID. Mientras estén, esas 55 no pueden cargarse.
--
-- 3. Están mal clasificadas. El prototipo pone `CXLIV-01-04-01_02-0019` en
--    Cozumel, Sección Primera; el catálogo del SID dice que el tomo CXLIV es
--    de Chetumal. La asignación coincide, la delegación no.
--
-- No se pierde trabajo: al momento de escribir esto la base de producción
-- tiene cero dictámenes jurídicos y cero transcripciones, sobre cualquier
-- foja. Nadie ha curado nada encima de estas fojas.
--
-- ── Qué NO se toca ─────────────────────────────────────────────────────────
-- La delegación Cozumel y la Sección Primera se quedan: ahora las comparten
-- con el acervo real. Solo se van los tomos del prototipo.
--
-- ── Alcance, con salvaguarda ───────────────────────────────────────────────
-- Se identifican por la ruta de sus imágenes, y solo se retira el tomo cuyas
-- imágenes son TODAS del prototipo. Un tomo que tuviera aunque sea una imagen
-- del acervo real queda intacto: así este retiro no puede llevarse por delante
-- material bueno, ni hoy ni si se corre de nuevo más adelante.
--
-- El borrado de `visor_tomos` arrastra en cascada fojas, imágenes,
-- inscripciones, dictámenes y transcripciones (ver las llaves foráneas).
--
-- IDEMPOTENTE: después de la primera corrida no queda nada que retirar.

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE tomos_prototipo ON COMMIT DROP AS
SELECT t.id
  FROM visor_tomos t
 WHERE EXISTS (
         SELECT 1 FROM visor_fojas f
           JOIN visor_imagenes_foja i ON i.foja_id = f.id
          WHERE f.tomo_id = t.id
            AND i.ruta_storage LIKE '/visor_documentos/importado_visar/%')
   AND NOT EXISTS (
         SELECT 1 FROM visor_fojas f
           JOIN visor_imagenes_foja i ON i.foja_id = f.id
          WHERE f.tomo_id = t.id
            AND i.ruta_storage NOT LIKE '/visor_documentos/importado_visar/%');

\echo ''
\echo 'Lo que se va a retirar:'
SELECT
  (SELECT count(*) FROM tomos_prototipo)                                              AS tomos,
  (SELECT count(*) FROM visor_fojas         WHERE tomo_id IN (SELECT id FROM tomos_prototipo)) AS fojas,
  (SELECT count(*) FROM visor_inscripciones WHERE tomo_id IN (SELECT id FROM tomos_prototipo)) AS inscripciones;

DELETE FROM visor_tomos WHERE id IN (SELECT id FROM tomos_prototipo);

\echo ''
\echo 'Lo que queda en el Visor:'
SELECT
  (SELECT count(*) FROM visor_tomos)         AS tomos,
  (SELECT count(*) FROM visor_fojas)         AS fojas,
  (SELECT count(*) FROM visor_imagenes_foja) AS imagenes,
  (SELECT count(*) FROM visor_inscripciones) AS inscripciones;

COMMIT;
