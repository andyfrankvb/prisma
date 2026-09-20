-- Catálogo de inscripciones del Visor de Documentos.
--
-- En VISAR (prototipo fuente de este módulo) esto vive como una entidad
-- separada (`Inscripcion`), importada desde un Excel de control (Gisnet:
-- TOMO/VOLUMEN/ASIGNACIÓN/ESTATUS/OBSERVACIONES) — no es lo mismo que
-- `visor_fojas.inscripcion` (que solo guarda un texto libre por foja).
-- Es el modo de navegación "por inscripción" que también tenía SID
-- (LibrosService.buscarInscripcionesSid / verInscripcionSid), en paralelo
-- al modo "por tomo/página".
--
-- `numero_inscripcion` corresponde 1:1 con `visor_fojas.numero_foja` dentro
-- del mismo tomo (verificado contra los datos reales de VISAR: la
-- asignación "CXLIV-01-04-01_02-0001" apunta a la foja "00001" del tomo
-- CXLIV) — de ahí `foja_id`, resuelto en el import y no recalculado en
-- cada lectura.
--
-- IDEMPOTENTE.

CREATE TABLE IF NOT EXISTS visor_inscripciones (
  id                  serial       PRIMARY KEY,
  -- id de la inscripción en el origen (VISAR/SID), para imports idempotentes.
  origen_id           integer      UNIQUE,
  tomo_id             integer      NOT NULL REFERENCES visor_tomos (id) ON DELETE CASCADE,
  -- Puede ser NULL si no se logró resolver contra una foja existente del tomo.
  foja_id             integer      REFERENCES visor_fojas (id) ON DELETE SET NULL,
  numero_inscripcion  integer      NOT NULL,
  volumen             varchar(50),
  asignacion          varchar(255) NOT NULL UNIQUE,
  estatus             varchar(100),
  observaciones       text,
  created_at          timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visor_inscripciones_tomo  ON visor_inscripciones (tomo_id);
CREATE INDEX IF NOT EXISTS idx_visor_inscripciones_foja  ON visor_inscripciones (foja_id);
CREATE INDEX IF NOT EXISTS idx_visor_inscripciones_numero ON visor_inscripciones (tomo_id, numero_inscripcion);
