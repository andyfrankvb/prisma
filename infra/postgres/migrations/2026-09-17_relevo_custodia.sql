-- Relevo de custodia entre transportistas.
--
-- Antes, cualquiera que escaneara el QR podía declararse portador: bastaba con
-- decir quién era. Nadie confirmaba que el anterior lo hubiera soltado, así que
-- el recorrido registraba quién DIJO que lo traía, no quién lo recibió de manos
-- de alguien.
--
-- Ahora el cambio de portador son dos actos, como en una entrega real:
--   1. quien lo trae escanea y elige a quién se lo entrega  → relevo pendiente
--   2. esa persona escanea y confirma                        → se vuelve custodio
--
-- Mientras el relevo no se confirme, el paquete SIGUE a nombre de quien lo trae:
-- un relevo a medias nunca deja el paquete sin responsable, que es justo lo que
-- este módulo existe para evitar.
--
-- El relevo vive en `paquetes` y no en una tabla aparte porque solo puede haber
-- uno pendiente a la vez: ofrecer el paquete a dos personas al mismo tiempo no
-- significa nada. Un relevo nuevo reemplaza al anterior.

ALTER TABLE paquetes ADD COLUMN IF NOT EXISTS relevo_para_id       integer;
ALTER TABLE paquetes ADD COLUMN IF NOT EXISTS relevo_de_id         integer;
ALTER TABLE paquetes ADD COLUMN IF NOT EXISTS relevo_solicitado_en timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paquetes_relevo_para_id_fkey') THEN
    ALTER TABLE paquetes
      ADD CONSTRAINT paquetes_relevo_para_id_fkey FOREIGN KEY (relevo_para_id)
      REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paquetes_relevo_de_id_fkey') THEN
    ALTER TABLE paquetes
      ADD CONSTRAINT paquetes_relevo_de_id_fkey FOREIGN KEY (relevo_de_id)
      REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_paquetes_relevo_para ON paquetes(relevo_para_id);

-- Tipo de movimiento nuevo: queda constancia de que se ofreció el paquete,
-- aunque el otro tarde en confirmarlo o nunca lo haga. Postgres no admite
-- «ADD CONSTRAINT IF NOT EXISTS», así que se quita y se vuelve a poner.
ALTER TABLE paquete_movimientos DROP CONSTRAINT IF EXISTS paquete_movimientos_tipo_check;
ALTER TABLE paquete_movimientos
  ADD CONSTRAINT paquete_movimientos_tipo_check
  CHECK (tipo IN ('CREADO', 'CERRADO', 'TRASLADO', 'ENTREGADO', 'CANCELADO', 'RELEVO'));
