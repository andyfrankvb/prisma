-- Turnar por envío de información, además de por competencia.
--
-- Hasta ahora turnar significaba una sola cosa: «esto no le toca a mi área».
-- Pero hay asuntos —testamentos, resoluciones— que llegan dirigidos a una
-- delegación, la delegación los trabaja hasta donde le corresponde y luego le
-- pasa lo hecho a la Dirección Jurídica para que continúe. Eso es lo contrario
-- de deslindarse, y registrarlo con el mismo motivo dejaba el expediente
-- diciendo que el área se desentendió de algo que sí trabajó.
--
-- El envío de información lleva un documento —lo que la delegación hizo— además
-- de la justificación, igual que ya lo hace el delegatorio al contestar.

ALTER TABLE oficio_turnos
  ADD COLUMN IF NOT EXISTS tipo          varchar(12) NOT NULL DEFAULT 'COMPETENCIA',
  ADD COLUMN IF NOT EXISTS documento_url text;

ALTER TABLE oficio_turnos DROP CONSTRAINT IF EXISTS chk_turno_tipo;
ALTER TABLE oficio_turnos
  ADD CONSTRAINT chk_turno_tipo
  CHECK (tipo IN ('COMPETENCIA', 'INFORMACION'));

-- Todo lo turnado hasta hoy fue por competencia: era el único motivo que existía.
UPDATE oficio_turnos SET tipo = 'COMPETENCIA' WHERE tipo IS NULL;

-- ── A quién iba dirigido el oficio, según el documento ───────────────────────
--
-- `dirigido_a_id` hace dos trabajos a la vez: dice a quién va dirigido el oficio
-- y sirve de puntero de quién lo tiene. Al turnar se reescribe, y con eso el
-- expediente pierde el dato original — un oficio dirigido a la Dirección General
-- terminaba diciendo que iba dirigido a quien lo recibió después.
--
-- Se separa el dato del puntero: aquí queda el destinatario del documento, que
-- se captura una vez y no se vuelve a tocar. El ruteo interno sigue usando
-- `dirigido_a_id` como hasta ahora, así que nada del flujo cambia.
ALTER TABLE oficios
  ADD COLUMN IF NOT EXISTS dirigido_a_original_id integer REFERENCES usuarios(id);

-- Para lo ya capturado, el mejor dato disponible del destinatario original es el
-- primero que registró un turno; si nunca se turnó, el actual sigue siendo el bueno.
UPDATE oficios o
   SET dirigido_a_original_id = COALESCE(
         (SELECT t.dirigido_anterior_id
            FROM oficio_turnos t
           WHERE t.oficio_id = o.id
             AND t.dirigido_anterior_id IS NOT NULL
           ORDER BY t.id ASC
           LIMIT 1),
         o.dirigido_a_id)
 WHERE o.dirigido_a_original_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_oficios_dirigido_original
  ON oficios (dirigido_a_original_id);
