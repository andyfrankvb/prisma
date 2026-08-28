-- Los correos de ingreso pasan a ser de cada quien.
--
-- El catálogo era único para toda la institución: la cuenta que usa la ventanilla
-- de Chetumal le aparecía a quien captura en Cancún, y al revés. Con una lista
-- corta se tolera; conforme cada delegación va sumando las suyas, elegir la
-- propia se vuelve buscar entre las de todos.
--
-- Ahora cada persona ve las que ella ha usado. No hace falta darlas de alta: se
-- guardan solas al registrar un oficio por correo, que es el único momento en que
-- se sabe cuáles usa de verdad.
--
-- Las que ya existen conservan a su autor donde se sabe quién fue; las que no lo
-- tienen registrado se quedan a la vista de todos, para no hacerle desaparecer a
-- nadie una cuenta que quizá esté usando.

ALTER TABLE catalogo_correos
  ADD COLUMN IF NOT EXISTS usuario_id integer REFERENCES usuarios(id);

UPDATE catalogo_correos
   SET usuario_id = creado_por_id
 WHERE usuario_id IS NULL
   AND creado_por_id IS NOT NULL;

-- El mismo correo puede estar en la lista de varias personas: la unicidad deja
-- de ser por institución y pasa a ser por persona.
ALTER TABLE catalogo_correos
  DROP CONSTRAINT IF EXISTS catalogo_correos_tipo_correo_key;

-- Dos índices porque `usuario_id` admite nulos y Postgres los trata como
-- distintos entre sí: sin el segundo, los heredados se podrían duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_correos_por_usuario
  ON catalogo_correos (tipo, correo, usuario_id) WHERE usuario_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_correos_heredados
  ON catalogo_correos (tipo, correo) WHERE usuario_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_correos_usuario
  ON catalogo_correos (usuario_id, tipo);
