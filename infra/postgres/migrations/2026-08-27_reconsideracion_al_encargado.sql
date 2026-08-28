-- A quién le cae un oficio regresado a corregir.
--
-- La reconsideración siempre bajaba hasta el analista que redactó: es lo correcto
-- cuando la pide el encargado sobre el trabajo de su propio equipo, pero no
-- cuando viene de arriba. Si la Directora General regresa un oficio que ya traía
-- visto bueno, quien tiene que responder es el encargado —que fue quien lo
-- aprobó y se lo mandó—, y él decide si lo corrige o se lo devuelve a su gente.
--
-- Saltárselo dejaba al analista con una observación que no le tocaba atender y al
-- encargado sin enterarse de que le habían rechazado lo que él firmó.
--
-- La marca se levanta sola cuando se sube la versión corregida o se vuelve a
-- aprobar: describe la vuelta en curso, no una propiedad del oficio.

ALTER TABLE oficios
  ADD COLUMN IF NOT EXISTS reconsideracion_al_encargado boolean NOT NULL DEFAULT false;
