-- Las campañas de digitalización del Visor.
--
-- El acervo registral se ha digitalizado varias veces a lo largo de los años, y
-- las campañas no se reemplazan: se complementan. En el tomo I volumen 01_02 de
-- Cozumel, la primera digitalización dejó 21 documentos y PEMR 2025 trae 81; 14
-- están en ambas, 7 solo en la primera y 67 solo en la nueva. Ninguna contiene a
-- la otra.
--
-- Por eso la campaña cuelga del DOCUMENTO y no del tomo. Si colgara del tomo,
-- habría que partirlo en uno por campaña y quien buscara la inscripción 150
-- tendría que adivinar en cuál está. Así el tomo es uno, con todo su contenido,
-- y cada documento dice de dónde viene.
--
-- ── Se construye sobre lo que ya existe ────────────────────────────────────
-- `visor_imagenes_foja.version` ya cumple ese papel —una imagen por foja y por
-- versión, con índice único que lo garantiza— y el servicio de imágenes, el
-- selector de la pantalla y el dictamen jurídico ya saben elegir entre
-- versiones. Lo que falta no es el mecanismo sino el significado: hoy las
-- 827,287 imágenes dicen `V_SID`, que no le dice nada a nadie.
--
-- Esta migración le pone nombre y año a esas claves, sin tocar una sola fila de
-- imágenes ni cambiar cómo se eligen.

-- ── 1. El catálogo ─────────────────────────────────────────────────────────
-- `clave` es el mismo valor que guarda `visor_imagenes_foja.version`: así el
-- servicio de imágenes y el dictamen siguen funcionando igual, y lo único que
-- se gana es poder mostrar "PEMR 2025" en vez de "V_PEMR2025".
CREATE TABLE IF NOT EXISTS visor_campanias (
  id          serial       PRIMARY KEY,
  clave       varchar(20)  NOT NULL UNIQUE,
  nombre      varchar(120) NOT NULL,
  -- Nulo cuando no se conoce: la primera digitalización del acervo no dejó
  -- registro de cuándo se hizo, ni en el catálogo del SID ni en los archivos.
  anio        integer,
  descripcion text,
  -- De más antigua a más reciente. Define qué se muestra por omisión cuando un
  -- documento existe en varias y no hay dictamen jurídico: la más reciente.
  orden       integer      NOT NULL DEFAULT 0,
  -- 'cargada'  sus documentos ya están en PRISMA.
  -- 'pendiente' la campaña existe y se sabe de ella, pero su acervo todavía no
  --             se carga. Se registra igual para que al abrir un tomo el
  --             usuario distinga "aquí no hay nada de esa campaña" de "esa
  --             campaña aún no se ha cargado", que no son lo mismo.
  estado      varchar(20)  NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('cargada', 'pendiente')),
  activo      boolean      NOT NULL DEFAULT true,
  created_at  timestamp    NOT NULL DEFAULT now()
);

INSERT INTO visor_campanias (clave, nombre, anio, descripcion, orden, estado)
SELECT v.clave, v.nombre, v.anio, v.descripcion, v.orden, v.estado
  FROM (VALUES
    ('V_SID',      'Primera digitalización', NULL::integer,
     'El acervo que PRISMA heredó del SID. No trae control de calidad por documento: ese dato empieza con PEMR 2025.',
     1, 'cargada'),
    ('V_PEM2023',  'PEM 2023',               2023,
     'Entrega que vive en el acervo (VISOR/PEM2023) y que el catálogo del SID nunca registró: 187,347 PDF de Chetumal y Cozumel, libros e inscripciones.',
     2, 'pendiente'),
    ('V_PEM2024',  'PEM 2024',               2024,
     'Entrega que vive en el acervo (VISOR/PEM2024) y que el catálogo del SID nunca registró: 7,147 PDF de Benito Juárez, libros e inscripciones.',
     3, 'pendiente'),
    ('V_PEMR2025', 'PEMR 2025',              2025,
     'Programa de digitalización 2025. Cozumel y parte de Chetumal, con validación y observaciones por documento.',
     4, 'cargada'),
    ('V_PEMR2026', 'PEMR 2026',              2026,
     'Programa de digitalización 2026. Parte de Chetumal, Cancún y Playa del Carmen. Todavía no se entrega.',
     5, 'pendiente')
  ) AS v(clave, nombre, anio, descripcion, orden, estado)
 WHERE NOT EXISTS (SELECT 1 FROM visor_campanias c WHERE c.clave = v.clave);

-- ── 2. Admitir las claves de PEMR ──────────────────────────────────────────
-- La restricción solo conocía las campañas del prototipo VISAR y la del SID.
ALTER TABLE visor_imagenes_foja DROP CONSTRAINT IF EXISTS visor_imagenes_foja_version_check;

ALTER TABLE visor_imagenes_foja
  ADD CONSTRAINT visor_imagenes_foja_version_check
  CHECK (version IN ('V2009', 'V2022_FALTANTE', 'V3_VALIDADA')
         OR version ~ '^V_SID[0-9]*$'
         OR version ~ '^V_PEMR?[0-9]{4}$');

-- ── 3. La calidad que reporta quien digitalizó ─────────────────────────────
-- Los listados del proveedor traen, por documento, un estatus y una
-- observación: "archivo digital con fondo negro", "imagen inclinada", "faltó
-- actualizar pág. 2, se encuentra el sello de traspaso", "el registro 123 no
-- está en archivo digital". De las 27,599 inscripciones de Cozumel, 26,905
-- traen observación escrita.
--
-- Van en la IMAGEN y no en la inscripción porque describen a ese archivo
-- concreto, no al acto registral: la misma inscripción digitalizada dos veces
-- tiene dos calidades distintas, y el usuario necesita ver la del documento que
-- está mirando.
--
-- No es un adorno: "faltó actualizar las anotaciones marginales de la foja 2"
-- significa que el documento digital no refleja el libro físico. Eso hay que
-- saberlo antes de certificar.
ALTER TABLE visor_imagenes_foja
  ADD COLUMN IF NOT EXISTS estatus       varchar(60),
  ADD COLUMN IF NOT EXISTS observaciones text;

-- ── 4. Un índice único de más ──────────────────────────────────────────────
-- `(foja_id, version)` quedó cubierto dos veces: por la restricción original de
-- la tabla y por el índice que agregó la migración de inscripciones del SID,
-- que no se dio cuenta de que ya existía. Se queda la restricción, que es la
-- original.
DROP INDEX IF EXISTS uq_visor_imagenes_foja_version;

-- ── 5. El dictamen jurídico también debe admitir las campañas reales ───────
-- `visor_dictamenes_versiones_foja.version_seleccionada` tenía la misma
-- restricción cerrada a las tres campañas del prototipo. Es justamente la
-- tabla donde Jurídico declara cuál versión de una foja es la válida, así que
-- sin esto nadie podría dictaminar sobre el acervo real: la validación del
-- controlador pasaba y la base rechazaba.
--
-- Se admite el mismo conjunto que las imágenes. No se valida contra
-- `visor_campanias` con una llave foránea a propósito: la restricción protege
-- del dato con forma inválida, y qué campañas existen lo decide el catálogo,
-- que es donde se agregan sin tocar el esquema.
ALTER TABLE visor_dictamenes_versiones_foja
  DROP CONSTRAINT IF EXISTS visor_dictamenes_versiones_foja_version_seleccionada_check;

ALTER TABLE visor_dictamenes_versiones_foja
  ADD CONSTRAINT visor_dictamenes_versiones_foja_version_seleccionada_check
  CHECK (version_seleccionada IN ('V2009', 'V2022_FALTANTE', 'V3_VALIDADA')
         OR version_seleccionada ~ '^V_SID[0-9]*$'
         OR version_seleccionada ~ '^V_PEMR?[0-9]{4}$');
