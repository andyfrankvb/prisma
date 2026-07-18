-- Seed: Delegados y sus equipos operativos
-- Contraseña de todos: password123
-- Hash bcrypt 10 rounds: $2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O

-- 1. Crear delegación Cancún (no existe aún)
INSERT INTO catalogo_unidades (nombre, tipo, clave, activo)
VALUES ('Delegación Cancún', 'DELEGACION', 'del_cancun', TRUE)
ON CONFLICT (clave) DO NOTHING;

-- 2. Insertar delegados y sus equipos
INSERT INTO usuarios (nombre, email, password_hash, rol, unidad_id, activo)
VALUES
  -- Delegación Cancún
  ('Maria Peña',          'maria.pena@demo.mx',    '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',  (SELECT id FROM catalogo_unidades WHERE clave='del_cancun'), true),
  ('Emily',               'emily@demo.mx',          '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO', (SELECT id FROM catalogo_unidades WHERE clave='del_cancun'), true),
  ('Melissa',             'melissa@demo.mx',         '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO', (SELECT id FROM catalogo_unidades WHERE clave='del_cancun'), true),
  -- Delegación Othón P. Blanco
  ('Mary Camara',         'mary.camara@demo.mx',    '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',  (SELECT id FROM catalogo_unidades WHERE clave='del_opb'),    true),
  ('Gloria',              'gloria@demo.mx',          '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO', (SELECT id FROM catalogo_unidades WHERE clave='del_opb'),    true),
  ('Grisel',              'grisel@demo.mx',          '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO', (SELECT id FROM catalogo_unidades WHERE clave='del_opb'),    true),
  -- Delegación Cozumel
  ('Armando Novelo',      'armando@demo.mx',         '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',  (SELECT id FROM catalogo_unidades WHERE clave='del_cozumel'), true),
  ('Wendy',               'wendy@demo.mx',           '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO', (SELECT id FROM catalogo_unidades WHERE clave='del_cozumel'), true),
  ('Guadalupe Vazquez',   'guadalupe@demo.mx',       '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO', (SELECT id FROM catalogo_unidades WHERE clave='del_cozumel'), true),
  -- Delegación Playa del Carmen
  ('Denisse Vazquez',     'denisse@demo.mx',         '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',  (SELECT id FROM catalogo_unidades WHERE clave='del_playa'),   true),
  ('Mariana',             'mariana@demo.mx',         '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO', (SELECT id FROM catalogo_unidades WHERE clave='del_playa'),   true)
ON CONFLICT (email) DO NOTHING;

-- 3. Asignar módulo tramites_seguimiento a todos los delegados y sus equipos
--    + supervision_eventos a los delegados (mismo nivel que directores de área)
INSERT INTO usuario_modulos (usuario_id, modulo_id, asignado_por_id, asignado_en)
SELECT u.id, m.id, 9, NOW()
FROM usuarios u
CROSS JOIN modulos m
WHERE u.email IN (
  'maria.pena@demo.mx', 'emily@demo.mx', 'melissa@demo.mx',
  'mary.camara@demo.mx', 'gloria@demo.mx', 'grisel@demo.mx',
  'armando@demo.mx', 'wendy@demo.mx', 'guadalupe@demo.mx',
  'denisse@demo.mx', 'mariana@demo.mx'
)
AND m.clave IN ('tramites_seguimiento', 'supervision_eventos')
ON CONFLICT (usuario_id, modulo_id) DO NOTHING;
