-- =============================================================
-- MIGRACIÓN: módulo "Tablero de Dirección" (monitoreo)
-- Fecha: 2026-06-09
--
-- Separa el Panel de Dirección (métricas, supervisión, bandeja)
-- de Oficialía de Partes, dejándolo como un módulo independiente
-- accesible desde el selector de módulos.
--
-- IDEMPOTENTE: usa ON CONFLICT / WHERE NOT EXISTS.
-- =============================================================

-- 1. Registrar el módulo en el catálogo
INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden)
VALUES (
  'tablero_direccion',
  'Tablero de Dirección',
  'Métricas, supervisión y monitoreo general de Dirección.',
  true,
  4
)
ON CONFLICT (clave) DO NOTHING;

-- 2. Asignar el módulo a todos los DIRECTOR de la unidad DIRECCION_GENERAL
--    (la Directora General). Se resuelve por tipo de unidad, no por id.
INSERT INTO usuario_modulos (usuario_id, modulo_id, asignado_por_id, asignado_en)
SELECT
  u.id,
  (SELECT id FROM modulos WHERE clave = 'tablero_direccion'),
  (SELECT id FROM usuarios WHERE rol = 'SUPERADMIN' ORDER BY id LIMIT 1),
  NOW()
FROM usuarios u
JOIN catalogo_unidades cu ON cu.id = u.unidad_id
WHERE cu.tipo = 'DIRECCION_GENERAL'
  AND u.rol  = 'DIRECTOR'
  AND u.activo = true
ON CONFLICT (usuario_id, modulo_id) DO NOTHING;

-- =============================================================
-- FIN DE LA MIGRACIÓN
-- =============================================================
