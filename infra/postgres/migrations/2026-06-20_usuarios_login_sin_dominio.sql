-- ─────────────────────────────────────────────────────────────
-- Login por usuario (sin dominio): se elimina lo que sigue al '@'
-- del email de cada usuario. Los correos eran de prueba (no reales),
-- así que no se pierde envío real.
--
-- 'mariann@rppc.qroo'  →  'mariann'
--
-- Idempotente: si ya no tiene '@', split_part devuelve el mismo valor.
-- (Verificado: no genera colisiones con el UNIQUE de email.)
-- ─────────────────────────────────────────────────────────────

UPDATE usuarios
   SET email = split_part(email, '@', 1)
 WHERE email LIKE '%@%';
