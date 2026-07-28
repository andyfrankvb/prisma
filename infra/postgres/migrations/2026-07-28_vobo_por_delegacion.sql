-- Quién da el Visto Bueno en cada delegación: el DELEGADO (por defecto, como
-- siempre) o el ENCARGADO de esa delegación. Solo aplica a unidades DELEGACION;
-- en la Dirección General el VoBo lo sigue dando el encargado.
ALTER TABLE catalogo_unidades
  ADD COLUMN IF NOT EXISTS vobo_por VARCHAR(20) NOT NULL DEFAULT 'DELEGADO';

-- Salvaguarda: valores válidos.
ALTER TABLE catalogo_unidades DROP CONSTRAINT IF EXISTS catalogo_unidades_vobo_por_chk;
ALTER TABLE catalogo_unidades
  ADD CONSTRAINT catalogo_unidades_vobo_por_chk CHECK (vobo_por IN ('DELEGADO', 'ENCARGADO'));
