-- Durante las pruebas ningún campo del ingreso es obligatorio. "Dirigido a"
-- (dirigido_a_id) puede quedar sin asignar, así que se permite nulo.
ALTER TABLE oficios ALTER COLUMN dirigido_a_id DROP NOT NULL;
