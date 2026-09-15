-- El código que va en el folio deja de estar escrito en el código fuente.
--
-- ── Qué problema resuelve ────────────────────────────────────────────────────
--
-- El folio de un oficio se arma así:
--
--     OF - 27082026 - DG - 0002
--          fecha      ↑    consecutivo
--                     └── código del área a la que va dirigido
--
-- Ese código salía de `codigoDeUnidad()` en `oficios.controller.ts`: una cadena de
-- condiciones sobre el NOMBRE del área —«si dice JURIDIC, entonces DJ»— con un
-- último recurso que armaba iniciales. Eso significa que **cada área nueva obliga
-- a tocar el código fuente y desplegar**: sin su renglón, una «Dirección de
-- Cultura» produciría `DDC` —«Dirección De Cultura»—, que no es como se nombra un
-- área. El renglón de Planeación se agregó a mano el 2026-09-08, por ese motivo.
--
-- Con el código en la unidad, dar de alta un área vuelve a ser lo que debe ser:
-- un renglón de datos.
--
-- ── Por qué se puede tocar sin miedo ─────────────────────────────────────────
--
-- Desde que el consecutivo es global (`folio_secuencia`), **el código ya no
-- interviene en la unicidad del folio**: la fecha y el número bastan para que no
-- se repita. El código quedó siendo una etiqueta que dice de un vistazo a qué área
-- entró el oficio. Cambiar uno no puede provocar folios repetidos.
--
-- Y no reescribe nada de lo ya emitido, ni debe hacerlo: un folio es una
-- identidad, no un dato que se recalcula. Si algún día se corrige el código de un
-- área, convivirán oficios viejos con el anterior y nuevos con el nuevo.

ALTER TABLE catalogo_unidades
  ADD COLUMN IF NOT EXISTS codigo_folio VARCHAR(6);

-- ── Los nueve valores actuales, tal cual ─────────────────────────────────────
--
-- Se copian exactamente los que devuelve hoy la función, de modo que NINGÚN folio
-- cambie: ni los emitidos ni los que salgan mañana en las áreas que ya operan.
-- Verificado contra los folios reales de producción — los códigos que aparecen en
-- ellos (DG, BJ, OPB, DJ, CZ, PDC) coinciden con este mapeo.
--
-- Va por `clave` y no por `id` a propósito: los ids difieren entre entornos
-- —Planeación es 44 en local y 43 en producción— y la clave es la misma en todos.
UPDATE catalogo_unidades SET codigo_folio = v.codigo
  FROM (VALUES
    ('dir_general',    'DG'),
    ('dir_juridica',   'DJ'),
    ('dir_tics',       'DTICS'),
    ('dir_admin',      'DA'),
    ('dir_planeacion', 'DP'),
    ('del_opb',        'OPB'),
    ('del_playa',      'PDC'),
    ('del_cozumel',    'CZ'),
    ('del_cancun',     'BJ')
  ) AS v(clave, codigo)
 WHERE catalogo_unidades.clave = v.clave
   AND catalogo_unidades.codigo_folio IS NULL;

-- Red de seguridad para cualquier entorno que tenga un área fuera de esa lista:
-- las iniciales de las palabras largas del nombre, que es lo mismo que hacía el
-- último recurso de la función. No debería aplicar a ninguna, pero deja la columna
-- sin nulos para poder exigirla abajo.
UPDATE catalogo_unidades
   SET codigo_folio = UPPER(LEFT(REGEXP_REPLACE(
         (SELECT string_agg(LEFT(p, 1), '')
            FROM unnest(string_to_array(
                   TRANSLATE(UPPER(nombre), 'ÁÉÍÓÚÑ', 'AEIOUN'), ' ')) AS p
           WHERE length(p) > 3),
         '[^A-Z]', '', 'g'), 4))
 WHERE codigo_folio IS NULL;

ALTER TABLE catalogo_unidades ALTER COLUMN codigo_folio SET NOT NULL;

COMMENT ON COLUMN catalogo_unidades.codigo_folio IS
  'Código del área dentro del folio (OF-DDMMAAAA-CODIGO-NNNN). Obligatorio: sin él, un área nueva no podría registrar oficios con nomenclatura correcta.';

-- ── Único entre las áreas vivas ──────────────────────────────────────────────
--
-- Dos áreas con el mismo código harían ilegible el folio justo en lo único que
-- aporta. Solo se exige entre las activas: un área dada de baja conserva el suyo
-- para que sus folios viejos sigan explicándose, y no estorba a la que lo herede.
CREATE UNIQUE INDEX IF NOT EXISTS uq_unidades_codigo_folio_activas
  ON catalogo_unidades (UPPER(codigo_folio)) WHERE activo;
