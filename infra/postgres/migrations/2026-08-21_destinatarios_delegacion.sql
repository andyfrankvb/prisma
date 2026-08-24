-- ─────────────────────────────────────────────────────────────
-- A qué áreas puede dirigir oficios cada delegación
--
-- Toda delegación puede dirigir a su propio titular y a la Dirección General:
-- son los oficios que normalmente llegan a su ventanilla.
--
-- Othón P. Blanco es distinta porque comparte sede con las direcciones de área:
-- ahí también se reciben oficios dirigidos a la Jurídica, la Administrativa y la
-- de Innovación. En vez de dejar ese caso escrito en el código, se marca con
-- esta bandera, que se administra desde el panel del SuperAdmin.
--
-- Las direcciones y la Dirección General no se acotan: pueden dirigir a todas.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE catalogo_unidades
  ADD COLUMN IF NOT EXISTS recibe_direcciones_area BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN catalogo_unidades.recibe_direcciones_area IS
  'Delegación que además puede dirigir oficios a las direcciones de área (comparte sede con ellas)';

-- Estado inicial: solo Othón P. Blanco, que está en la sede.
UPDATE catalogo_unidades
   SET recibe_direcciones_area = TRUE
 WHERE tipo = 'DELEGACION'
   AND translate(upper(nombre), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') LIKE '%OTHON%';
