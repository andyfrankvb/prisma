-- La función JURIDICO pasa a ser por unidad y a admitir varias personas.
--
-- Hasta ahora se capturaba sin unidad —«global»— y en la práctica no gobernaba
-- nada: quién podía recibir un expediente se deducía de tener el módulo
-- habilitado, así que la configuración se editaba sin que cambiara el
-- comportamiento. El objetivo es que designar analistas sea una decisión
-- explícita, por área, como ya lo son el oficial de partes y el encargado.
--
-- Dos cosas hay que arreglar aquí, y el orden importa:
--
--   1. El índice `uq_cfg_flujos_rol_unico` obliga a UNA sola fila por
--      (módulo, rol, unidad) para todo lo que no sea OFICIAL ni SECRETARIA.
--      Los cuatro jurídicos de hoy conviven únicamente porque su unidad es
--      NULL y Postgres trata los nulos como distintos. En cuanto tuvieran
--      unidad, el segundo analista del área sería rechazado por la base.
--
--   2. Las filas existentes hay que moverlas a la unidad de cada persona.
--
-- Si se moviera primero y se ampliara el índice después, el paso 2 fallaría:
-- los cuatro pertenecen a la misma Dirección Jurídica.

-- ── 1. JURIDICO se suma a los roles que admiten varios por unidad ──────────

DROP INDEX IF EXISTS uq_cfg_flujos_varios_por_usuario;
DROP INDEX IF EXISTS uq_cfg_flujos_rol_unico;

-- Varios actores por unidad: cada persona una vez.
CREATE UNIQUE INDEX uq_cfg_flujos_varios_por_usuario
  ON configuracion_flujos (modulo_clave, rol_flujo, unidad_id, usuario_id)
  WHERE rol_flujo IN ('OFICIAL', 'SECRETARIA', 'JURIDICO');

-- Un solo actor por unidad: de ellos se deduce a quién le cae cada oficio, así
-- que dos volverían impredecible esa resolución.
CREATE UNIQUE INDEX uq_cfg_flujos_rol_unico
  ON configuracion_flujos (modulo_clave, rol_flujo, unidad_id)
  WHERE rol_flujo NOT IN ('OFICIAL', 'SECRETARIA', 'JURIDICO');

-- ── 2. Las capturas existentes se llevan a la unidad de cada persona ───────

UPDATE configuracion_flujos cf
SET unidad_id = u.unidad_id
FROM usuarios u
WHERE u.id = cf.usuario_id
  AND cf.modulo_clave = 'oficialia_partes'
  AND cf.rol_flujo    = 'JURIDICO'
  AND cf.unidad_id IS NULL
  AND u.unidad_id IS NOT NULL;
