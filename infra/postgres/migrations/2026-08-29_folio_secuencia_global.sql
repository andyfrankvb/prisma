-- Contador único de folios por día.
--
-- Hasta ahora la secuencia del folio se calculaba contando los oficios que ese
-- día iban dirigidos al área destino, y sumando uno. Eso daba una numeración
-- POR ÁREA: cada delegación llevaba su propio 0001, 0002…
--
-- Se cambia a una secuencia GLOBAL del día: el segundo oficio que entra al
-- sistema es el 0002, aunque para su área sea el primero. Así el número dice
-- cuántos oficios entraron a la institución ese día, que es el control que se
-- pidió.
--
-- ── Por qué una tabla y no seguir contando ───────────────────────────────────
--
-- Contar filas y sumar uno funciona mientras dos personas no registren a la vez.
-- Con la numeración por área eso casi no pasaba —competían solo dentro de su
-- propia área—, pero con un contador único **todas las ventanillas del estado
-- compiten por el mismo número**, y dos capturas simultáneas obtendrían el mismo.
-- El código detecta el choque y responde «Folio ya existe, intenta de nuevo»,
-- que hoy es una rareza y pasaría a ser cotidiano.
--
-- Con esta tabla el número se pide con un INSERT … ON CONFLICT DO UPDATE que
-- incrementa y devuelve el valor en una sola operación atómica: la base serializa
-- a quien llegue segundo y le entrega el siguiente. No hay dos iguales ni hace
-- falta reintentar.
--
-- Los huecos son posibles y aceptables: si se toma un número y el registro falla
-- después, ese número no se reutiliza. Es preferible a arriesgar un duplicado en
-- un identificador que va impreso en un acuse.

CREATE TABLE IF NOT EXISTS folio_secuencia (
  fecha  date PRIMARY KEY,
  ultimo integer NOT NULL DEFAULT 0
);

-- Se siembra con lo ya registrado, día por día, para que el contador continúe
-- donde va y no reinicie hoy en 1 habiendo entrado oficios esta mañana.
INSERT INTO folio_secuencia (fecha, ultimo)
SELECT fecha_registro::date, count(*)
  FROM oficios
 WHERE fecha_registro IS NOT NULL
 GROUP BY 1
ON CONFLICT (fecha) DO NOTHING;
