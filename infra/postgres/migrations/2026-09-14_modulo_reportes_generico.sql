-- El módulo "reportes_satq" deja de ser un solo reporte y pasa a ser un
-- módulo de reportes en general (Alta Dirección: varios reportes visuales y
-- resumidos). El primero es "Conciliación de Ingresos" (SATQ vs RPP); el
-- siguiente será FRE (Folio Registral Electrónico). La clave en BD se deja
-- igual ("reportes_satq") para no romper las asignaciones de usuario_modulos
-- que ya existen — solo cambia lo que el usuario ve.

UPDATE modulos
   SET nombre_display = 'Módulo de Reportes',
       descripcion    = 'Reportes ejecutivos: conciliación de ingresos, FRE y más'
 WHERE clave = 'reportes_satq';
