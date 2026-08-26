-- Catálogo de dependencias y remitentes como módulo propio.
--
-- Depurar los catálogos —corregir nombres mal escritos, unir duplicados, mover
-- una sub-unidad de dependencia— lo hacía solo el SuperAdmin, o quien tuviera el
-- rol de flujo CATALOGOS. Ese rol tenía un problema: el botón vive dentro de la
-- pantalla del oficial de partes, así que solo lo alcanzaba quien entrara por
-- ahí. Una delegada o cualquier persona de un área no llegaba nunca.
--
-- Se resuelve con un módulo, que es el mecanismo que el sistema ya tiene para
-- decidir quién ve qué. NO se duplica nada: es un renglón de menú y una ruta que
-- monta la misma pantalla y consume las mismas tablas que usa el SuperAdmin.

INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden)
SELECT 'catalogos',
       'Catálogo de dependencias y remitentes',
       'Depurar dependencias, sub-unidades, remitentes y correos de ingreso',
       true,
       5
WHERE NOT EXISTS (SELECT 1 FROM modulos WHERE clave = 'catalogos');

-- Quien ya tenía la facultad por el rol de flujo la conserva, ahora por módulo.
-- Sin esto, al retirar el rol perderían el acceso sin que nadie se entere.
-- `asignado_por_id` es obligatorio: queda a nombre del SuperAdmin, que es quien
-- otorgaba el permiso hasta ahora, y si no hubiera ninguno, del propio usuario.
INSERT INTO usuario_modulos (usuario_id, modulo_id, asignado_en, asignado_por_id)
SELECT DISTINCT cf.usuario_id,
       (SELECT id FROM modulos WHERE clave = 'catalogos'),
       now(),
       COALESCE((SELECT id FROM usuarios WHERE rol = 'SUPERADMIN' ORDER BY id LIMIT 1),
                cf.usuario_id)
  FROM configuracion_flujos cf
 WHERE cf.modulo_clave = 'oficialia_partes'
   AND cf.rol_flujo    = 'CATALOGOS'
   AND cf.usuario_id IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM usuario_modulos um
          WHERE um.usuario_id = cf.usuario_id
            AND um.modulo_id  = (SELECT id FROM modulos WHERE clave = 'catalogos'));

-- Y se retira el rol, para no dejar dos mecanismos que hagan lo mismo: uno de
-- ellos se quedaría sin mantenimiento y acabaría contradiciendo al otro.
DELETE FROM configuracion_flujos
 WHERE modulo_clave = 'oficialia_partes'
   AND rol_flujo    = 'CATALOGOS';
