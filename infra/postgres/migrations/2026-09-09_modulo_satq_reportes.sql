-- Módulo "Reportes SATQ" — perfil Administrador del reporteador de ingresos.
--
-- Fase 1 (resumen ejecutivo) vive dentro del tablero de Dirección, detrás del
-- guard de rol de supervisión que ya existe. Fase 2 agrega el detalle
-- filtrable por fila, que sí necesita el mecanismo de módulos para poder
-- asignarse a personas puntuales (p.ej. analistas de SATQ) sin depender de un
-- rol de sistema fijo.

INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden)
SELECT 'reportes_satq',
       'Reportes SATQ',
       'Detalle filtrable de ingresos SATQ y conciliación con RPP/SIQROO',
       true,
       6
WHERE NOT EXISTS (SELECT 1 FROM modulos WHERE clave = 'reportes_satq');

-- El SuperAdmin siempre tiene acceso (el guard del backend lo exime), pero se
-- le asigna también el módulo para que aparezca en su menú sin trato especial.
INSERT INTO usuario_modulos (usuario_id, modulo_id, asignado_en, asignado_por_id)
SELECT u.id,
       (SELECT id FROM modulos WHERE clave = 'reportes_satq'),
       now(),
       u.id
  FROM usuarios u
 WHERE u.rol = 'SUPERADMIN'
   AND NOT EXISTS (
         SELECT 1 FROM usuario_modulos um
          WHERE um.usuario_id = u.id
            AND um.modulo_id  = (SELECT id FROM modulos WHERE clave = 'reportes_satq'));
