-- El Visto Bueno pasa a ser configurable también en las DIRECCIONES de área
-- (Jurídica, Innovación, Administrativa), no solo en las delegaciones.
--
-- La columna `vobo_por` se creó con DEFAULT 'DELEGADO', así que las direcciones ya
-- tienen ese valor guardado aunque el sistema nunca lo leyera. Al empezar a leerlo,
-- el VoBo pasaría del encargado al titular de un momento a otro — incluidos los
-- oficios que estén EN_REVISION en este instante.
--
-- Para que el despliegue NO cambie el comportamiento, se fija 'ENCARGADO' en las
-- direcciones de área: es justo como funcionan hoy. A partir de aquí el SuperAdmin
-- decide, unidad por unidad, si aprueba el encargado o el director.
--
-- No toca DELEGACION (ya era configurable) ni DIRECCION_GENERAL (siempre el encargado).
UPDATE catalogo_unidades
   SET vobo_por = 'ENCARGADO'
 WHERE tipo = 'DIRECCION';
