-- Renombra el módulo "Reportes SATQ" → "Reporte de Ingresos" (mismo módulo,
-- misma clave "reportes_satq"; solo cambia el texto que ve el usuario).

UPDATE modulos
   SET nombre_display = 'Reporte de Ingresos',
       descripcion    = 'Detalle filtrable de ingresos y conciliación con RPP/SIQROO'
 WHERE clave = 'reportes_satq';
