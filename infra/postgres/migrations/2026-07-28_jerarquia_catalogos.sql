-- Jerarquía de catálogos de ingreso: Dependencia → Sub-unidad → Remitente (persona).
-- La sub-unidad pertenece a una dependencia; el remitente pertenece a una sub-unidad.

-- Sub-unidad → dependencia
ALTER TABLE catalogo_unidades_internas
  ADD COLUMN IF NOT EXISTS dependencia_id INTEGER REFERENCES catalogo_dependencias(id) ON DELETE CASCADE;
ALTER TABLE catalogo_unidades_internas DROP CONSTRAINT IF EXISTS catalogo_unidades_internas_nombre_key;
ALTER TABLE catalogo_unidades_internas DROP CONSTRAINT IF EXISTS catalogo_unidades_internas_dep_nombre_key;
ALTER TABLE catalogo_unidades_internas
  ADD CONSTRAINT catalogo_unidades_internas_dep_nombre_key UNIQUE (dependencia_id, nombre);
CREATE INDEX IF NOT EXISTS idx_unidades_internas_dep ON catalogo_unidades_internas (dependencia_id);

-- Remitente → sub-unidad
ALTER TABLE catalogo_remitentes
  ADD COLUMN IF NOT EXISTS unidad_interna_id INTEGER REFERENCES catalogo_unidades_internas(id) ON DELETE CASCADE;
ALTER TABLE catalogo_remitentes DROP CONSTRAINT IF EXISTS catalogo_remitentes_nombre_key;
ALTER TABLE catalogo_remitentes DROP CONSTRAINT IF EXISTS catalogo_remitentes_uni_nombre_key;
ALTER TABLE catalogo_remitentes
  ADD CONSTRAINT catalogo_remitentes_uni_nombre_key UNIQUE (unidad_interna_id, nombre);
CREATE INDEX IF NOT EXISTS idx_remitentes_uni ON catalogo_remitentes (unidad_interna_id);
