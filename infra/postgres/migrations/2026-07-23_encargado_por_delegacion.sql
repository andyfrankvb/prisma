-- El rol ENCARGADO de Recepción de Oficios pasa a ser POR DELEGACIÓN.
-- El routing usa el "dirigido a" del oficio: según la unidad del destinatario,
-- cae en la bandeja del encargado configurado para esa unidad.

-- 1) Migrar el encargado global (Oscar) a la Dirección General (unidad 34):
--    los oficios dirigidos a la Directora General caen en su bandeja.
UPDATE configuracion_flujos
SET unidad_id = 34
WHERE modulo_clave = 'oficialia_partes'
  AND rol_flujo    = 'ENCARGADO'
  AND unidad_id IS NULL;

-- 2) Sembrar a cada delegado como encargado de su propia delegación
--    (se puede cambiar después desde el módulo de flujos).
INSERT INTO configuracion_flujos (modulo_clave, rol_flujo, usuario_id, unidad_id, actualizado_por_id, actualizado_en)
SELECT 'oficialia_partes', 'ENCARGADO', u.id, u.unidad_id,
       (SELECT id FROM usuarios WHERE rol='SUPERADMIN' ORDER BY id LIMIT 1), now()
FROM usuarios u
WHERE u.email IN ('marycamara', 'denisse', 'armando', 'maria.pena')
  AND u.unidad_id IS NOT NULL
ON CONFLICT (modulo_clave, rol_flujo, unidad_id)
DO UPDATE SET usuario_id = EXCLUDED.usuario_id, actualizado_en = now();

-- 3) Los encargados de delegación necesitan el módulo de Recepción de Oficios habilitado.
INSERT INTO usuario_modulos (usuario_id, modulo_id, asignado_por_id, asignado_en)
SELECT u.id, m.id,
       (SELECT id FROM usuarios WHERE rol='SUPERADMIN' ORDER BY id LIMIT 1), now()
FROM usuarios u
CROSS JOIN modulos m
WHERE u.email IN ('marycamara', 'denisse', 'armando', 'maria.pena')
  AND m.clave = 'oficialia_partes'
ON CONFLICT DO NOTHING;
