-- Seed: usuarios reales del sistema
-- Contraseña de todos: password123
-- Hash bcrypt 10 rounds: $2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O
--
-- NOTA: usa subqueries por clave en lugar de IDs hardcodeados
-- para funcionar tanto en BD de desarrollo (IDs 1-N) como en producción.
-- Requiere que catalogo_unidades ya tenga las claves correspondientes
-- (creadas por 00_schema.sql y por el INSERT de Dirección Administrativa abajo).
--
-- Módulo officialia_partes    clave='officialia_partes'
-- Módulo supervision_eventos  clave='supervision_eventos'
-- Super Admin fallback id     primer usuario con rol SUPERADMIN

-- ── 0. Asegurar que existe Dirección Administrativa ──────────────────────────
-- (no está en 00_schema.sql; se agrega aquí de forma idempotente)
INSERT INTO catalogo_unidades (nombre, tipo, clave, activo)
VALUES ('Dirección Administrativa', 'DIRECCION', 'dir_admin', TRUE)
ON CONFLICT (clave) DO NOTHING;

-- ── 1. Usuarios ──────────────────────────────────────────────────────────────
INSERT INTO usuarios (nombre, email, password_hash, rol, unidad_id, activo) VALUES
  -- ── Dirección General ──────────────────────────────────────────────────────
  ('Mariann Gonzalez Pliego Castillo', 'mariann@rppc.qroo',  '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',   (SELECT id FROM catalogo_unidades WHERE clave='dir_general'), true),
  ('Fabian Montiel',                   'fabian@demo.mx',     '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_general'), true),
  ('Tania Huerta',                     'tania@demo.mx',      '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'SECRETARIA', (SELECT id FROM catalogo_unidades WHERE clave='dir_general'), true),
  -- ── Dirección de Innovación, Informática y Archivo (TICS) ─────────────────
  ('Carlos Tah',                       'carlos.tah@demo.mx', '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',   (SELECT id FROM catalogo_unidades WHERE clave='dir_tics'), true),
  ('Andy Frank',                       'andy@demo.mx',       '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_tics'), true),
  ('Mariela',                          'mariela@demo.mx',    '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_tics'), true),
  ('Miguel',                           'miguel@demo.mx',     '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_tics'), true),
  ('Emiliano',                         'emiliano@demo.mx',   '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_tics'), true),
  ('Emanuel',                          'emanuel@demo.mx',    '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_tics'), true),
  ('Gerardo',                          'gerardo@demo.mx',    '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_tics'), true),
  ('Nohemy',                           'nohemy@demo.mx',     '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_tics'), true),
  ('Victor',                           'victor@demo.mx',     '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_tics'), true),
  ('Claudina',                         'claudina@demo.mx',   '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_tics'), true),
  -- ── Dirección Jurídica ────────────────────────────────────────────────────
  ('Oscar Gopar',                      'oscar@demo.mx',      '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',   (SELECT id FROM catalogo_unidades WHERE clave='dir_juridica'), true),
  ('Tania Juridico',                   'tania.jur@demo.mx',  '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_juridica'), true),
  ('Luis Juridico',                    'luis.jur@demo.mx',   '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_juridica'), true),
  ('Erika',                            'erika@demo.mx',      '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_juridica'), true),
  -- ── Dirección Administrativa ──────────────────────────────────────────────
  ('Raymundo Padilla',                 'raymundo@demo.mx',   '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',   (SELECT id FROM catalogo_unidades WHERE clave='dir_admin'), true),
  ('Sharely',                          'sharely@demo.mx',    '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_admin'), true),
  ('Jesus',                            'jesus@demo.mx',      '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_admin'), true),
  ('Oliver',                           'oliver@demo.mx',     '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  (SELECT id FROM catalogo_unidades WHERE clave='dir_admin'), true)
ON CONFLICT (email) DO NOTHING;

-- ── 2. Módulo supervision_eventos → todos los directores y operativos ────────
INSERT INTO usuario_modulos (usuario_id, modulo_id, asignado_por_id, asignado_en)
SELECT
  u.id,
  m.id,
  (SELECT id FROM usuarios WHERE rol = 'SUPERADMIN' ORDER BY id LIMIT 1),
  NOW()
FROM usuarios u
CROSS JOIN modulos m
WHERE u.email IN (
  'mariann@rppc.qroo', 'fabian@demo.mx', 'tania@demo.mx',
  'carlos.tah@demo.mx', 'andy@demo.mx', 'mariela@demo.mx', 'miguel@demo.mx',
  'emiliano@demo.mx', 'emanuel@demo.mx', 'gerardo@demo.mx', 'nohemy@demo.mx',
  'victor@demo.mx', 'claudina@demo.mx',
  'oscar@demo.mx', 'tania.jur@demo.mx', 'luis.jur@demo.mx', 'erika@demo.mx',
  'raymundo@demo.mx', 'sharely@demo.mx', 'jesus@demo.mx', 'oliver@demo.mx'
)
AND m.clave = 'supervision_eventos'
ON CONFLICT (usuario_id, modulo_id) DO NOTHING;

-- ── 3. Módulo officialia_partes → Mariann (Directora General) ────────────────
-- La Directora General debe ver el Panel de Dirección (Dashboard_Director)
-- en el módulo de Oficialía de Partes.
INSERT INTO usuario_modulos (usuario_id, modulo_id, asignado_por_id, asignado_en)
SELECT
  u.id,
  m.id,
  (SELECT id FROM usuarios WHERE rol = 'SUPERADMIN' ORDER BY id LIMIT 1),
  NOW()
FROM usuarios u
CROSS JOIN modulos m
WHERE u.email = 'mariann@rppc.qroo'
  AND m.clave  = 'officialia_partes'
ON CONFLICT (usuario_id, modulo_id) DO NOTHING;
