-- Seed de datos para desarrollo local
-- Contraseña de todos los usuarios: password123
-- Hash bcrypt de 'password123' con 10 rounds
--
-- IDs de catalogo_unidades (según 00_schema.sql):
--   1 = Dirección General
--   2 = Dirección de Innovación, Informática y Archivo (TICS)
--   3 = Dirección Jurídica
--   4 = Delegación Othón P. Blanco
--   5 = Delegación Benito Juárez
--   6 = Delegación Playa del Carmen
--   7 = Delegación Cozumel

-- password123 → hash generado con bcrypt 10 rounds
INSERT INTO usuarios (nombre, email, password_hash, rol, unidad_id, activo) VALUES
  -- Directora General (unidad_id = 1 → Dirección General)
  ('Carlos Director',       'director@demo.mx',      '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',   1, true),
  -- Equipo directo de la Directora General
  ('Fabián Montiel',        'fabian.montiel@demo.mx','$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'SECRETARIA', 1, true),
  ('Tania Huerta',          'tania.huerta@demo.mx',  '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'SECRETARIA', 1, true),
  -- Super Administrador
  ('Super Admin',           'superadmin@demo.mx',    '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'SUPERADMIN', 1, true),
  -- Director de Innovación, Informática y Archivo
  ('Carlos Tah',            'dir.tics@demo.mx',      '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',   2, true),
  ('Op. TICS 1',            'op.tics1@demo.mx',      '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  2, true),
  ('Op. TICS 2',            'op.tics2@demo.mx',      '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  2, true),
  -- Dirección Jurídica
  ('Dir. Juridico',         'dir.juridico@demo.mx',  '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',   3, true),
  ('Op. Juridico 1',        'op.juridico1@demo.mx',  '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  3, true),
  -- Delegación Othón P. Blanco
  ('Delegado OPB',          'del.opb@demo.mx',       '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',   4, true),
  ('Op. OPB 1',             'op.opb1@demo.mx',       '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  4, true),
  -- Delegación Benito Juárez
  ('Delegado BJ',           'del.bj@demo.mx',        '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',   5, true),
  ('Op. BJ 1',              'op.bj1@demo.mx',        '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  5, true),
  -- Delegación Playa del Carmen
  ('Delegado Playa',        'del.playa@demo.mx',     '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',   6, true),
  ('Op. Playa 1',           'op.playa1@demo.mx',     '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  6, true),
  -- Delegación Cozumel
  ('Delegado Cozumel',      'del.cozumel@demo.mx',   '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'DIRECTOR',   7, true),
  ('Op. Cozumel 1',         'op.cozumel1@demo.mx',   '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  7, true),
  -- Usuarios del módulo Oficialía de Partes (Delegación OPB como base)
  ('Juan Oficial',          'oficial@demo.mx',       '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OFICIAL',    4, true),
  ('Ana Encargada',         'encargado@demo.mx',     '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'ENCARGADO',  4, true),
  ('Luis Abogado',          'juridico@demo.mx',      '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'JURIDICO',   3, true),
  ('Rosa Secretaria',       'secretaria@demo.mx',    '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'SECRETARIA', 1, true),
  -- Operativo Administrativo (sin dirección administrativa propia — asignado a Dir. General)
  ('Op. Administrativo 1',  'op.admin1@demo.mx',     '$2b$10$7cl6OUlA7syZ0AIGwJHTS.P5Jz2F1NY8Cc9Km2WvUig6g8PqjYX.O', 'OPERATIVO',  1, true)
ON CONFLICT (email) DO NOTHING;

-- ── Módulos del sistema ───────────────────────────────────────
INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden) VALUES
  ('oficialia_partes',    'Oficialía de Partes',    'Recepción, registro y seguimiento de oficios oficiales.', true, 1),
  ('supervision_eventos', 'Supervisión de Eventos', 'Gestión de eventos operativos y tareas por área.',        true, 2)
ON CONFLICT (clave) DO NOTHING;
