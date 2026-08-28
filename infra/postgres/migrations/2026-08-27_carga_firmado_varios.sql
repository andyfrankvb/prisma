-- La carga del firmado deja de ser de una sola persona.
--
-- El rol se llamaba SECRETARIA y admitía un único usuario, sin unidad. En la
-- práctica no es un puesto sino una facultad: quien la tiene sube el oficio ya
-- firmado, lo cierra y puede regresarlo a corregir. Que dependiera de una sola
-- persona significaba que en cuanto ella se enfermara o saliera de vacaciones,
-- nada se podía cerrar.
--
-- El nombre guardado no cambia —migrarlo obligaría a tocar cada lugar que lo
-- consulta, sin ganar nada—; en pantalla ya se llama «Carga del firmado».
--
-- Tener varias personas no vuelve ambiguo nada: de este rol no se deduce «a quién
-- le toca» un oficio, solo «quién puede», y el primero que suba el documento lo
-- cierra. Distinto del ENCARGADO, que sí resuelve a quién le cae cada oficio y
-- por eso sigue siendo único por unidad.
--
-- Los índices dejan de nombrar a OFICIAL como el caso especial y pasan a listar
-- los roles que admiten varios actores.

DROP INDEX IF EXISTS uq_cfg_flujos_oficial_por_usuario;
DROP INDEX IF EXISTS uq_cfg_flujos_rol_unico;

-- Varios actores, pero cada persona una sola vez: sin esto, agregar dos veces a
-- la misma dejaría renglones repetidos que la pantalla mostraría duplicados.
CREATE UNIQUE INDEX uq_cfg_flujos_varios_por_usuario
  ON configuracion_flujos (modulo_clave, rol_flujo, unidad_id, usuario_id)
  WHERE rol_flujo IN ('OFICIAL', 'SECRETARIA');

-- Un solo actor por unidad para el resto.
CREATE UNIQUE INDEX uq_cfg_flujos_rol_unico
  ON configuracion_flujos (modulo_clave, rol_flujo, unidad_id)
  WHERE rol_flujo NOT IN ('OFICIAL', 'SECRETARIA');
