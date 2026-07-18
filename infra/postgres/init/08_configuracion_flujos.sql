-- =============================================================
-- MÓDULO: CONFIGURACIÓN DE FLUJOS POR MÓDULO
-- Script: 08_configuracion_flujos.sql
-- Idempotente: usa CREATE TABLE IF NOT EXISTS y ON CONFLICT DO NOTHING
-- =============================================================

-- 1. Tabla configuracion_flujos
CREATE TABLE IF NOT EXISTS configuracion_flujos (
  id                  SERIAL       PRIMARY KEY,
  modulo_clave        VARCHAR(100) NOT NULL
                          REFERENCES modulos(clave)
                          ON UPDATE CASCADE ON DELETE RESTRICT,
  rol_flujo           VARCHAR(100) NOT NULL,
  usuario_id          INTEGER      NOT NULL
                          REFERENCES usuarios(id)
                          ON UPDATE CASCADE ON DELETE RESTRICT,
  actualizado_por_id  INTEGER      NOT NULL
                          REFERENCES usuarios(id)
                          ON UPDATE CASCADE ON DELETE RESTRICT,
  actualizado_en      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_configuracion_flujos UNIQUE (modulo_clave, rol_flujo)
);

CREATE INDEX IF NOT EXISTS idx_cfg_flujos_modulo_clave  ON configuracion_flujos (modulo_clave);
CREATE INDEX IF NOT EXISTS idx_cfg_flujos_actualizado_en ON configuracion_flujos (actualizado_en DESC);
CREATE INDEX IF NOT EXISTS idx_cfg_flujos_usuario_id    ON configuracion_flujos (usuario_id);

-- 2. Tabla auditoria_configuracion_flujos
CREATE TABLE IF NOT EXISTS auditoria_configuracion_flujos (
  id                  SERIAL       PRIMARY KEY,
  modulo_clave        VARCHAR(100) NOT NULL,
  rol_flujo           VARCHAR(100) NOT NULL,
  usuario_id_anterior INTEGER
                          REFERENCES usuarios(id)
                          ON DELETE SET NULL,
  usuario_id_nuevo    INTEGER      NOT NULL
                          REFERENCES usuarios(id)
                          ON DELETE RESTRICT,
  actualizado_por_id  INTEGER      NOT NULL
                          REFERENCES usuarios(id)
                          ON DELETE RESTRICT,
  actualizado_en      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aud_cfg_flujos_modulo_clave   ON auditoria_configuracion_flujos (modulo_clave);
CREATE INDEX IF NOT EXISTS idx_aud_cfg_flujos_actualizado_en ON auditoria_configuracion_flujos (actualizado_en DESC);

-- =============================================================
-- DATOS SEMILLA
-- =============================================================

-- tramites_seguimiento / REVISOR
-- → Director de unidad tipo DIRECCION (no DELEGACION ni DIRECCION_GENERAL)
INSERT INTO configuracion_flujos (modulo_clave, rol_flujo, usuario_id, actualizado_por_id)
SELECT
  'tramites_seguimiento',
  'REVISOR',
  u.id,
  (SELECT id FROM usuarios WHERE rol = 'SUPERADMIN' ORDER BY id LIMIT 1)
FROM usuarios u
JOIN catalogo_unidades cu ON cu.id = u.unidad_id
WHERE u.rol = 'DIRECTOR'
  AND cu.tipo = 'DIRECCION'
  AND u.activo = true
ORDER BY u.id
LIMIT 1
ON CONFLICT (modulo_clave, rol_flujo) DO NOTHING;

-- tramites_seguimiento / FINALIZADOR
-- → Operativo de unidad tipo DIRECCION cuyo nombre contenga 'TICS', 'Innovaci' o 'Inform'
INSERT INTO configuracion_flujos (modulo_clave, rol_flujo, usuario_id, actualizado_por_id)
SELECT
  'tramites_seguimiento',
  'FINALIZADOR',
  u.id,
  (SELECT id FROM usuarios WHERE rol = 'SUPERADMIN' ORDER BY id LIMIT 1)
FROM usuarios u
JOIN catalogo_unidades cu ON cu.id = u.unidad_id
WHERE u.rol = 'OPERATIVO'
  AND cu.tipo = 'DIRECCION'
  AND (
    cu.nombre ILIKE '%TICS%'
    OR cu.nombre ILIKE '%Innovaci%'
    OR cu.nombre ILIKE '%Inform%'
  )
  AND u.activo = true
ORDER BY u.id
LIMIT 1
ON CONFLICT (modulo_clave, rol_flujo) DO NOTHING;

-- oficialia_partes / ENCARGADO
-- → primer usuario con rol ENCARGADO activo
INSERT INTO configuracion_flujos (modulo_clave, rol_flujo, usuario_id, actualizado_por_id)
SELECT
  'oficialia_partes',
  'ENCARGADO',
  u.id,
  (SELECT id FROM usuarios WHERE rol = 'SUPERADMIN' ORDER BY id LIMIT 1)
FROM usuarios u
WHERE u.rol = 'ENCARGADO'
  AND u.activo = true
ORDER BY u.id
LIMIT 1
ON CONFLICT (modulo_clave, rol_flujo) DO NOTHING;

-- oficialia_partes / SECRETARIA
-- → primer usuario con rol SECRETARIA activo
INSERT INTO configuracion_flujos (modulo_clave, rol_flujo, usuario_id, actualizado_por_id)
SELECT
  'oficialia_partes',
  'SECRETARIA',
  u.id,
  (SELECT id FROM usuarios WHERE rol = 'SUPERADMIN' ORDER BY id LIMIT 1)
FROM usuarios u
WHERE u.rol = 'SECRETARIA'
  AND u.activo = true
ORDER BY u.id
LIMIT 1
ON CONFLICT (modulo_clave, rol_flujo) DO NOTHING;

-- oficialia_partes / OFICIAL
-- → primer usuario con rol OFICIAL activo
INSERT INTO configuracion_flujos (modulo_clave, rol_flujo, usuario_id, actualizado_por_id)
SELECT
  'oficialia_partes',
  'OFICIAL',
  u.id,
  (SELECT id FROM usuarios WHERE rol = 'SUPERADMIN' ORDER BY id LIMIT 1)
FROM usuarios u
WHERE u.rol = 'OFICIAL'
  AND u.activo = true
ORDER BY u.id
LIMIT 1
ON CONFLICT (modulo_clave, rol_flujo) DO NOTHING;

-- =============================================================
-- FIN DEL SCRIPT
-- =============================================================
