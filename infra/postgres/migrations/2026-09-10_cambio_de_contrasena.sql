-- El usuario cambia su propia contraseña, y la temporal del administrador caduca al usarse.
--
-- ── Qué problema resuelve ────────────────────────────────────────────────────
--
-- Hoy nadie puede cambiar su contraseña. Lo único que existe es que el SUPERADMIN
-- la restablezca desde Administración de Usuarios, escribiéndola él. De ahí salen
-- dos cosas incómodas: para cambiarla hay que pedírselo a alguien, y ese alguien
-- la elige y por lo tanto la conoce. En la práctica, ninguna contraseña es solo de
-- su dueño.
--
-- No hay servicio de correo, así que un enlace de recuperación no es opción. El
-- flujo acordado es el que ya se usaba de palabra, pero cerrándolo por sistema:
-- el usuario le pide el cambio al superadmin, el superadmin genera una contraseña
-- TEMPORAL, y al entrar con ella el sistema OBLIGA a cambiarla antes de dejarlo
-- hacer cualquier otra cosa. Desde ese momento la contraseña vuelve a ser de una
-- sola persona.

-- ── La bandera ───────────────────────────────────────────────────────────────
--
-- Se enciende cuando la contraseña la puso alguien que no es el dueño: al
-- restablecerla y al dar de alta al usuario, que es el mismo caso. Se apaga en el
-- único momento en que el dueño la elige: cuando la cambia él.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS password_debe_cambiar BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN usuarios.password_debe_cambiar IS
  'La contraseña actual la puso un tercero. Mientras esté en true, la API no responde nada salvo el cambio de contraseña.';

-- ── La marca de tiempo ───────────────────────────────────────────────────────
--
-- Sirve para dos cosas distintas, y por eso es una sola columna y no dos:
--
--   · EXPULSAR LAS SESIONES VIEJAS. Los tokens duran 8 horas y nadie los revisa
--     contra la base, así que hasta ahora restablecer una contraseña no sacaba a
--     quien ya estuviera dentro: si el motivo era que alguien entró sin permiso,
--     esa persona seguía trabajando hasta 8 horas después. Comparando esta marca
--     con el momento en que se firmó el token, cambiar la contraseña cierra todas
--     las sesiones al instante.
--
--   · SABER DESDE CUÁNDO ESTÁ PENDIENTE una temporal. La temporal no caduca —se
--     dicta por teléfono y obligar a pedir otra generaría llamadas de más—, pero
--     sin caducidad el riesgo se vuelve invisible: una clave dictada por WhatsApp
--     sigue sirviendo mientras su dueño no entre. Con esta marca, la lista de
--     usuarios muestra «temporal sin usar — 6 días» y el superadmin tiene motivo
--     para preguntar qué pasó.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS password_cambiada_en TIMESTAMPTZ;

COMMENT ON COLUMN usuarios.password_cambiada_en IS
  'Cuándo se fijó la contraseña actual. Los tokens firmados antes de este instante dejan de valer.';

-- Las cuentas que ya existen no se molestan: su contraseña es la que siempre han
-- usado y nadie acaba de tocarla. Se les deja la bandera en false y la marca en
-- nulo, que el código lee como «no hay nada que invalidar».
