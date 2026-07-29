-- Catálogo de dependencias y remitentes para el Ingreso de Oficio.
-- El remitente se elige en cascada: primero la dependencia, luego la persona
-- registrada de esa dependencia. Ambos catálogos crecen con el uso.

CREATE TABLE IF NOT EXISTS catalogo_dependencias (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(255) NOT NULL UNIQUE,
  activo        BOOLEAN NOT NULL DEFAULT true,
  creado_por_id INTEGER REFERENCES usuarios(id),
  creado_en     TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalogo_remitentes (
  id             SERIAL PRIMARY KEY,
  dependencia_id INTEGER NOT NULL REFERENCES catalogo_dependencias(id) ON DELETE CASCADE,
  nombre         VARCHAR(255) NOT NULL,
  activo         BOOLEAN NOT NULL DEFAULT true,
  creado_por_id  INTEGER REFERENCES usuarios(id),
  creado_en      TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (dependencia_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_catalogo_remitentes_dep
  ON catalogo_remitentes(dependencia_id);

-- Bootstrap: precargar el catálogo con lo que ya exista en oficios
INSERT INTO catalogo_dependencias (nombre)
SELECT DISTINCT btrim(dependencia_origen)
FROM oficios
WHERE dependencia_origen IS NOT NULL AND btrim(dependencia_origen) <> ''
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO catalogo_remitentes (dependencia_id, nombre)
SELECT DISTINCT d.id, btrim(o.remitente)
FROM oficios o
JOIN catalogo_dependencias d ON d.nombre = btrim(o.dependencia_origen)
WHERE o.remitente IS NOT NULL AND btrim(o.remitente) <> ''
ON CONFLICT (dependencia_id, nombre) DO NOTHING;
