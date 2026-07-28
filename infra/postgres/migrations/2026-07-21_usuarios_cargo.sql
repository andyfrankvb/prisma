-- Cargo/nombramiento de cada usuario (para mostrar en catálogos junto al nombre).
-- No afecta roles, módulos ni login (todo eso va por id/email).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(255);

-- Nombres completos + cargos correctos de los directores (key = usuario de login)
UPDATE usuarios SET nombre = 'Mariann González Pliego Castillo',     cargo = 'Directora General'                                    WHERE email = 'mariann';
UPDATE usuarios SET nombre = 'Carlos Iván Tah Pérez',                 cargo = 'Director de Innovación, Informática y de Archivo'     WHERE email = 'carlostah';
UPDATE usuarios SET nombre = 'Oscar Mario Gopar Torres',             cargo = 'Asesor Jurídico'                                     WHERE email = 'oscargopar';
UPDATE usuarios SET nombre = 'Raymundo Radilla García',              cargo = 'Jefe de Recursos Humanos'                            WHERE email = 'raymundoradilla';
UPDATE usuarios SET nombre = 'María Jesús Tzuc Peña',                cargo = 'Delegada de Benito Juárez'                           WHERE email = 'maria.pena';
UPDATE usuarios SET nombre = 'María De Guadalupe Cámara González',   cargo = 'Delegada de Othón P. Blanco'                         WHERE email = 'marycamara';
UPDATE usuarios SET nombre = 'Armando José Novelo Bobadilla',        cargo = 'Delegado de Cozumel'                                 WHERE email = 'armando';
UPDATE usuarios SET nombre = 'Denisse Elena Vazquez Castillo',       cargo = 'Delegada de Playa del Carmen'                        WHERE email = 'denisse';
