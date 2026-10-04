-- Permiso para ver las observaciones del proveedor en el Visor.
--
-- Los listados de digitalización traen, por documento, lo que encontró quien lo
-- escaneó: "archivo digital con fondo negro", "imagen inclinada", "faltó
-- actualizar las anotaciones marginales de la foja 2", "el registro 123 no está
-- en archivo digital". De las 27,599 inscripciones de Cozumel, 26,905 traen
-- observación escrita.
--
-- Esa información es confidencial: dice dónde el acervo digital no refleja el
-- libro físico, y en manos equivocadas señala exactamente qué documentos son
-- débiles. No todo el que consulta el Visor debe verla.
--
-- ── Por qué aquí ──────────────────────────────────────────────────────────
-- `usuario_modulos` es donde se decide quién entra a cada módulo, así que es
-- donde el administrador ya está trabajando cuando concede el Visor. Poner el
-- permiso en otra tabla obligaría a configurarlo en dos pantallas distintas, y
-- el riesgo de conceder el módulo y olvidar la restricción es justo lo que hay
-- que evitar.
--
-- La columna es explícita y no un campo libre de opciones: se consulta en cada
-- búsqueda del Visor y conviene que el esquema diga qué significa.
--
-- ── Por qué nace en falso ─────────────────────────────────────────────────
-- Es información confidencial: quien la necesite se la concede a propósito. Con
-- el valor contrario, conceder el módulo habría abierto la puerta sin que nadie
-- lo decidiera, y las asignaciones que ya existen —incluidas las de producción—
-- habrían quedado con el permiso puesto de golpe.
ALTER TABLE usuario_modulos
  ADD COLUMN IF NOT EXISTS ver_observaciones boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN usuario_modulos.ver_observaciones IS
  'Visor de Documentos: si esta persona puede ver las observaciones y el estatus que reportó quien digitalizó cada documento. Confidencial; nace en falso.';
