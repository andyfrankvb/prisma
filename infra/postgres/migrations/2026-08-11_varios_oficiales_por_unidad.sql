-- Permite VARIOS oficiales de partes en la misma delegación.
--
-- Hasta ahora la restricción UNIQUE (modulo_clave, rol_flujo, unidad_id) obligaba a
-- un solo actor por rol y unidad. Eso es correcto para ENCARGADO, SECRETARIA y
-- JURIDICO —de ahí se resuelve a quién le cae cada oficio, y dos actores volverían
-- esa resolución impredecible—, pero estorba en el OFICIAL de partes: una
-- delegación puede tener varias personas recibiendo oficios.
--
-- El OFICIAL no se consulta desde esta tabla para decidir nada: su alcance sale del
-- rol de su propia cuenta (ve los oficios de su oficina que él mismo registró), así
-- que varios conviven sin pisarse.
--
-- Se reemplaza la restricción única por dos índices parciales:
--   · roles distintos de OFICIAL → siguen siendo únicos por unidad
--   · OFICIAL                    → único por (unidad, usuario), o sea varios usuarios
--                                   pero sin repetir a la misma persona

ALTER TABLE configuracion_flujos
  DROP CONSTRAINT IF EXISTS uq_cfg_flujos_modulo_rol_unidad;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cfg_flujos_rol_unico
  ON configuracion_flujos (modulo_clave, rol_flujo, unidad_id)
  WHERE rol_flujo <> 'OFICIAL';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cfg_flujos_oficial_por_usuario
  ON configuracion_flujos (modulo_clave, rol_flujo, unidad_id, usuario_id)
  WHERE rol_flujo = 'OFICIAL';
