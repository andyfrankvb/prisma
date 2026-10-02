-- Prepara el Visor para recibir el acervo real del SID.
--
-- Hasta ahora el módulo vivía con datos de prueba del prototipo VISAR: una
-- delegación, 5 tomos y 3,483 fojas. El acervo verdadero está en el SID —
-- 638,171 PDF ya convertidos, de 5,896 tomos de las cuatro delegaciones— y para
-- recibirlo faltan dos cosas en el modelo.
--
-- ── 1. El volumen ──────────────────────────────────────────────────────────
-- En el SID un tomo se subdivide en volúmenes ("1_1", "01_02"), y así están
-- organizadas las carpetas del acervo. `visor_tomos` solo guardaba el número
-- romano, así que dos volúmenes del mismo tomo se mezclarían en uno.
-- Se guarda como texto vacío y no nulo cuando el tomo no tiene volumen (pasa
-- en 5,156 archivos del acervo, que cuelgan directo del tomo). Con nulo, la
-- clave única necesitaría una expresión COALESCE, y Postgres exige que esa
-- expresión coincida exactamente —tipo incluido— con la del INSERT que intenta
-- resolver el conflicto. Una columna sin nulos evita esa trampa.
ALTER TABLE visor_tomos
  ADD COLUMN IF NOT EXISTS volumen varchar(50) NOT NULL DEFAULT '';

-- La identidad de un tomo del acervo es la combinación completa: la misma
-- "SECCION 4 / CCLXXVI" existe en varias delegaciones.
CREATE UNIQUE INDEX IF NOT EXISTS uq_visor_tomos_acervo
  ON visor_tomos (delegacion_id, seccion_id, numero_romano, volumen);

-- ── 2. Las secciones que faltaban ──────────────────────────────────────────
-- Estaban sembradas de la 1 a la 4; el acervo del SID llega hasta la 7. Sin
-- ellas, dos de cada tres fojas de Chetumal no tendrían dónde entrar.
INSERT INTO visor_secciones (numero, nombre)
SELECT v.numero, v.nombre
  FROM (VALUES (5, 'Sección Quinta'), (6, 'Sección Sexta'), (7, 'Sección Séptima')) AS v(numero, nombre)
 WHERE NOT EXISTS (SELECT 1 FROM visor_secciones s WHERE s.numero = v.numero);

-- ── 3. Trazabilidad del origen ─────────────────────────────────────────────
-- `visor_imagenes_foja.origen_id` guarda el id del registro en el catálogo del
-- SID (`visor_pdf_index.id_documento`): permite repetir la migración sin
-- duplicar y saber de dónde salió cada archivo.
ALTER TABLE visor_imagenes_foja
  ADD COLUMN IF NOT EXISTS origen_id bigint;

-- Sin filtro parcial a propósito: en Postgres los nulos no chocan entre sí, así
-- que un índice único normal ya permite las imágenes que no vienen del SID. Con
-- `WHERE origen_id IS NOT NULL` habría que repetir esa condición en cada INSERT
-- que quiera resolver el conflicto, y olvidarlo falla de forma muy opaca.
CREATE UNIQUE INDEX IF NOT EXISTS uq_visor_imagenes_origen
  ON visor_imagenes_foja (origen_id);

-- Una foja es única dentro de su tomo: el mismo criterio que usa el acervo,
-- donde el nombre del archivo es el número de página.
CREATE UNIQUE INDEX IF NOT EXISTS uq_visor_fojas_tomo_numero
  ON visor_fojas (tomo_id, numero_foja);

-- ── 4. Campos que el acervo real no trae ───────────────────────────────────
-- `indice_orden` y `anio_registro` llegaron del prototipo VISAR, donde cada
-- tomo se capturaba a mano con esos datos. El catálogo del SID no los tiene:
-- se arma desde las carpetas del acervo, que solo dicen delegación, sección,
-- tomo y volumen. Dejarlos obligatorios obligaría a inventar un año.
ALTER TABLE visor_tomos ALTER COLUMN indice_orden  DROP NOT NULL;
ALTER TABLE visor_tomos ALTER COLUMN anio_registro DROP NOT NULL;

-- ── 5. La versión del acervo de SID ────────────────────────────────────────
-- `version` solo admitía los nombres de las campañas de digitalización del
-- prototipo VISAR (V2009, V2022_FALTANTE, V3_VALIDADA). El acervo del SID es
-- otra cosa: una sola versión activa por foja, marcada en su catálogo con un
-- número. Se admite `V_SID` —con un número opcional, por si algún día publican
-- una segunda digitalización— en vez de forzarlo a una campaña que no es suya.
ALTER TABLE visor_imagenes_foja DROP CONSTRAINT IF EXISTS visor_imagenes_foja_version_check;

ALTER TABLE visor_imagenes_foja
  ADD CONSTRAINT visor_imagenes_foja_version_check
  CHECK (version IN ('V2009', 'V2022_FALTANTE', 'V3_VALIDADA') OR version ~ '^V_SID[0-9]*$');
