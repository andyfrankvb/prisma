-- OPCIONAL — designa como analistas jurídicos a quienes hoy ya pueden recibir
-- expedientes, para que el despliegue no interrumpa el reparto de trabajo.
--
-- No vive en `migrations/` a propósito: no corre sola. Se ejecuta a mano solo si
-- se decide que producción arranque con las designaciones ya puestas.
--
-- ── Qué problema resuelve ────────────────────────────────────────────────────
--
-- Antes, quién podía recibir un oficio se deducía: misma unidad, módulo
-- habilitado, rol operativo y no ser oficial ni encargado. Ahora se designa
-- expresamente por área. Al desplegar, las áreas sin designaciones se quedan con
-- el desplegable de «Asignar» vacío hasta que alguien las capture — y eso puede
-- ser todas a la vez, en horario laboral.
--
-- Esta consulta captura exactamente a las mismas personas que la regla anterior
-- ya dejaba pasar, así que el primer día nadie nota el cambio. A partir de ahí la
-- lista se cura desde Configuración de Flujos: quitar a quien no deba estar es un
-- clic, y agregar a quien falte también.
--
-- Lo ya asignado NO depende de esto: vive en `asignaciones_juridicas` y sigue
-- viéndose y trabajándose con normalidad se corra o no este guion.
--
-- Es seguro repetirla: `ON CONFLICT DO NOTHING` evita duplicar designaciones.

INSERT INTO configuracion_flujos
       (modulo_clave, rol_flujo, usuario_id, unidad_id, actualizado_por_id, actualizado_en)
SELECT DISTINCT
       'oficialia_partes',
       'JURIDICO',
       u.id,
       u.unidad_id,
       (SELECT id FROM usuarios WHERE rol = 'SUPERADMIN' AND activo ORDER BY id LIMIT 1),
       now()
FROM usuarios u
JOIN usuario_modulos um ON um.usuario_id = u.id
JOIN modulos m          ON m.id = um.modulo_id AND m.clave = 'oficialia_partes'
WHERE u.activo
  AND u.unidad_id IS NOT NULL
  AND u.rol IN ('OPERATIVO', 'JURIDICO')
  -- El encargado reparte el trabajo, no lo recibe.
  AND NOT EXISTS (
        SELECT 1 FROM configuracion_flujos cf
         WHERE cf.usuario_id   = u.id
           AND cf.modulo_clave = 'oficialia_partes'
           AND cf.rol_flujo    = 'ENCARGADO')
ON CONFLICT DO NOTHING;

-- Qué quedó designado, por área:
SELECT cu.nombre AS unidad, string_agg(u.nombre, ', ' ORDER BY u.nombre) AS analistas
FROM configuracion_flujos cf
JOIN usuarios u           ON u.id = cf.usuario_id
JOIN catalogo_unidades cu ON cu.id = cf.unidad_id
WHERE cf.modulo_clave = 'oficialia_partes' AND cf.rol_flujo = 'JURIDICO'
GROUP BY cu.nombre
ORDER BY cu.nombre;
