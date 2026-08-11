-- Configuración general del sistema (clave → valor).
-- Se usa para los dos recursos que se muestran en la pantalla de inicio de sesión.
-- Cada recurso es genérico: se habilita o no, tiene su título y puede ser un
-- ENLACE (p. ej. YouTube) o un ARCHIVO PDF cargado.
CREATE TABLE IF NOT EXISTS configuracion_sistema (
  clave              VARCHAR(100) PRIMARY KEY,
  valor              TEXT,
  actualizado_en     TIMESTAMPTZ DEFAULT now(),
  actualizado_por_id INTEGER REFERENCES usuarios(id)
);

-- Valores iniciales. `tipo` admite 'enlace' o 'archivo'.
INSERT INTO configuracion_sistema (clave, valor) VALUES
  ('recurso1_habilitado', 'false'),
  ('recurso1_titulo',     'Video demostrativo de PRISMA'),
  ('recurso1_tipo',       'enlace'),
  ('recurso1_url',        ''),
  ('recurso1_archivo',    ''),
  ('recurso2_habilitado', 'false'),
  ('recurso2_titulo',     'Manual de funcionamiento de PRISMA'),
  ('recurso2_tipo',       'archivo'),
  ('recurso2_url',        ''),
  ('recurso2_archivo',    '')
ON CONFLICT (clave) DO NOTHING;

-- Migración de los nombres anteriores (si esta BD ya tenía la versión previa),
-- para no perder lo que el SUPERADMIN hubiera capturado.
UPDATE configuracion_sistema d
   SET valor = o.valor
  FROM configuracion_sistema o
 WHERE o.clave = 'recurso_video_titulo'   AND d.clave = 'recurso1_titulo'  AND COALESCE(o.valor,'') <> '';
UPDATE configuracion_sistema d
   SET valor = o.valor
  FROM configuracion_sistema o
 WHERE o.clave = 'recurso_video_url'      AND d.clave = 'recurso1_url'     AND COALESCE(o.valor,'') <> '';
UPDATE configuracion_sistema d
   SET valor = o.valor
  FROM configuracion_sistema o
 WHERE o.clave = 'recurso_manual_titulo'  AND d.clave = 'recurso2_titulo'  AND COALESCE(o.valor,'') <> '';
UPDATE configuracion_sistema d
   SET valor = o.valor
  FROM configuracion_sistema o
 WHERE o.clave = 'recurso_manual_archivo' AND d.clave = 'recurso2_archivo' AND COALESCE(o.valor,'') <> '';

DELETE FROM configuracion_sistema
 WHERE clave IN ('recurso_video_titulo', 'recurso_video_url',
                 'recurso_manual_titulo', 'recurso_manual_archivo');
