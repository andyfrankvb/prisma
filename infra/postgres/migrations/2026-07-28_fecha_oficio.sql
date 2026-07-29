-- Fecha impresa en el documento del oficio (la que trae el oficio de origen),
-- distinta de la fecha de acuse/registro (cuándo se ingresó al sistema).
ALTER TABLE oficios ADD COLUMN IF NOT EXISTS fecha_oficio DATE;
