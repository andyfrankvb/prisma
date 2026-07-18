-- =============================================================
-- MIGRACIÓN: asistentes de la Directora General como observadores
-- Fecha: 2026-06-09
--
-- Fabian Montiel y Tania Huerta (Dirección General) pueden VER las
-- mismas vistas que la Directora General, pero solo observar — el
-- backend bloquea cualquier acción del flujo (requieren rol DIRECTOR).
--
-- Les asigna los mismos módulos que tiene la DG.
-- IDEMPOTENTE.
-- =============================================================

INSERT INTO usuario_modulos (usuario_id, modulo_id, asignado_por_id, asignado_en)
SELECT
  u.id,
  m.id,
  (SELECT id FROM usuarios WHERE rol = 'SUPERADMIN' ORDER BY id LIMIT 1),
  NOW()
FROM usuarios u
CROSS JOIN modulos m
WHERE u.email IN ('fabianmontiel@rppc.qroo', 'taniahuerta@rppc.qroo')
  AND m.clave IN ('tablero_direccion', 'supervision_eventos', 'oficialia_partes', 'tramites_seguimiento')
ON CONFLICT (usuario_id, modulo_id) DO NOTHING;

-- =============================================================
-- FIN DE LA MIGRACIÓN
-- =============================================================
