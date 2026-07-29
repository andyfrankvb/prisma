-- El remitente (persona) vuelve a ser una lista GLOBAL independiente:
-- las personas se mueven de dependencia/sector, así que no se atan a la sub-unidad.
-- (Dependencia → Sub-unidad se mantiene en cascada.)
ALTER TABLE catalogo_remitentes DROP CONSTRAINT IF EXISTS catalogo_remitentes_uni_nombre_key;
DELETE FROM catalogo_remitentes a USING catalogo_remitentes b WHERE a.nombre = b.nombre AND a.id > b.id;
ALTER TABLE catalogo_remitentes DROP CONSTRAINT IF EXISTS catalogo_remitentes_nombre_key;
ALTER TABLE catalogo_remitentes ADD CONSTRAINT catalogo_remitentes_nombre_key UNIQUE (nombre);
ALTER TABLE catalogo_remitentes DROP COLUMN IF EXISTS unidad_interna_id;
