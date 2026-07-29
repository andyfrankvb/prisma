-- Los tres catálogos del ingreso (dependencia, unidad interna, remitente) son
-- INDEPENDIENTES entre sí: las personas y las áreas se mueven de dependencia, así
-- que el oficial elige cada uno por separado con el buscador.

-- 1) Remitentes: desligar de la dependencia (antes colgaban de ella).
ALTER TABLE catalogo_remitentes DROP CONSTRAINT IF EXISTS catalogo_remitentes_dependencia_id_fkey;
ALTER TABLE catalogo_remitentes ALTER COLUMN dependencia_id DROP NOT NULL;
ALTER TABLE catalogo_remitentes DROP CONSTRAINT IF EXISTS catalogo_remitentes_dependencia_id_nombre_key;
-- Deduplicar por nombre antes de la unicidad global (conserva el menor id).
DELETE FROM catalogo_remitentes a USING catalogo_remitentes b WHERE a.nombre = b.nombre AND a.id > b.id;
ALTER TABLE catalogo_remitentes DROP CONSTRAINT IF EXISTS catalogo_remitentes_nombre_key;
ALTER TABLE catalogo_remitentes ADD CONSTRAINT catalogo_remitentes_nombre_key UNIQUE (nombre);

-- 2) Catálogo de unidades internas (subdirecciones/áreas dentro de una dependencia).
CREATE TABLE IF NOT EXISTS catalogo_unidades_internas (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(255) NOT NULL UNIQUE,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por_id INTEGER REFERENCES usuarios(id),
  creado_en     TIMESTAMP NOT NULL DEFAULT now()
);

-- 3) Unidad interna del oficio (área remitente dentro de la dependencia).
ALTER TABLE oficios ADD COLUMN IF NOT EXISTS unidad_interna VARCHAR(255);
