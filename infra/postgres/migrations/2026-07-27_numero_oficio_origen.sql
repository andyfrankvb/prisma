-- Número de oficio que trae el documento de la dependencia de origen
-- (distinto del folio interno que genera PRISMA). Opcional.
ALTER TABLE oficios ADD COLUMN IF NOT EXISTS numero_oficio_origen VARCHAR(120);
