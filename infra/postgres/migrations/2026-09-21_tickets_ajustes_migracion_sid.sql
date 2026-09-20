-- Ajustes a `tickets` antes de correr db/migrate-tickets-sid.mjs.
--
-- Al inspeccionar los 13,760 tickets reales de `sid.tickets` (2011-2026)
-- aparecieron valores que el esquema de 2026-09-20_tickets.sql no
-- contemplaba — ese esquema se diseñó a partir del catálogo ESTÁTICO que
-- ofrece hoy el formulario Angular (`/tickets/opciones/*`), no de los datos
-- históricos reales, que llevan 15 años usando categorías más libres:
--
--  · tipo: 12,509 de 13,760 filas (91%) vienen en blanco — el campo se
--    volvió obligatorio en algún punto posterior de la vida de SID.
--  · urgencia/impacto/prioridad: valores reales como "Muy urgente", "Alta"
--    (como urgencia), "Urgente" (como prioridad) y "Muy alto" no están en
--    los catálogos estáticos, pero suman miles de filas — no son ruido.
--  · categoria: los valores reales ("FOLIO", "IMAGENES", "OTROS", códigos
--    sueltos "1"/"0", etc.) no tienen ninguna relación con el catálogo
--    nuevo (TRASPASO_FOLIO, REPOSICION, ...) — son dos esquemas de
--    clasificación distintos que nunca coincidieron. Se preserva el valor
--    original en `categoria_legacy` en vez de forzar un mapeo falso.
ALTER TABLE tickets ALTER COLUMN tipo DROP NOT NULL;

ALTER TABLE tickets DROP CONSTRAINT tickets_urgencia_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_urgencia_check
  CHECK (urgencia IN ('URGENTE', 'MUY_URGENTE', 'ALTA', 'MEDIA', 'BAJA', 'INDEFINIDA'));

ALTER TABLE tickets DROP CONSTRAINT tickets_impacto_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_impacto_check
  CHECK (impacto IN ('MUY_ALTO', 'ALTO', 'MEDIO', 'BAJO'));

ALTER TABLE tickets DROP CONSTRAINT tickets_prioridad_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_prioridad_check
  CHECK (prioridad IN ('URGENTE', 'ALTA', 'MEDIA', 'BAJA'));

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS categoria_legacy varchar(100);
