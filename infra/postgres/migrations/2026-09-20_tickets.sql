-- Módulo de Tickets (mesa de ayuda interna).
-- Migrado desde SID (backend/app/Http/Controllers/TicketController.php,
-- backend/app/Models/Ticket.php, backend/app/Models/TicketFile.php).
--
-- Roles de SID (rol_id numérico: 1,2,3,5,6,7,8,11,12,15, con 11 = "Mesa de
-- Control" y 6 = "Director") no tienen equivalente 1 a 1 en el modelo de
-- identidad único de PRISMA (usuarios.rol + catalogo_unidades). En vez de
-- forzar ese mapeo, se crea una unidad propia para la mesa de ayuda: quien
-- gestiona tickets (cambia estado, recibe los que otras áreas les dirigen)
-- es SUPERADMIN o un DIRECTOR/OPERATIVO de esta unidad — igual que
-- `getUserTramiteRole` resuelve "Director Jurídico" como DIRECTOR de
-- unidad_id=36 en vez de un rol aparte.
--
-- Estilo de esquema: varchar + CHECK en vez de tipos ENUM nativos (igual que
-- 2026-09-18_consulta_publica.sql y 2026-09-19_vigilancia_consultas.sql) —
-- un ENUM nativo no admite ALTER dentro de una transacción, y los valores
-- de estos catálogos sí van a cambiar con el tiempo.
-- `codigo_folio` (VARCHAR(6), único entre unidades activas) es una columna
-- que el esquema real ya trae (agregada después de 00_schema.sql, no estaba
-- documentada ahí) — mismo estilo de código corto que las demás unidades
-- (DG, DTICS, DJ, OPB, etc.).
INSERT INTO catalogo_unidades (nombre, tipo, clave, codigo_folio, activo)
VALUES ('Mesa de Control de Tickets', 'DIRECCION', 'MESA_CONTROL_TICKETS', 'MCT', true)
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS tickets (
  id                serial       PRIMARY KEY,
  -- id del ticket en `sid.tickets` — permite que db/migrate-tickets-sid.mjs
  -- sea idempotente y reanudable (igual patrón que `consulta_publica.origen_id`).
  -- NULL en los tickets creados nativamente en PRISMA.
  origen_id         integer      UNIQUE,
  -- Folio YYMM + secuencia de 3 dígitos reiniciada cada mes (ver
  -- ticket_code_counters) — mismo formato visible que SID, pero calculado
  -- con un UPSERT atómico en vez de dos SELECTs separados (el legacy tenía
  -- una condición de carrera real bajo concurrencia).
  ticket_code       varchar(20)  NOT NULL UNIQUE,
  titulo            varchar(255) NOT NULL,
  descripcion       text         NOT NULL,
  tipo              varchar(20)  NOT NULL CHECK (tipo IN ('APERTURA', 'MODIFICACION')),
  estado            varchar(20)  NOT NULL DEFAULT 'NUEVO'
                       CHECK (estado IN ('NUEVO', 'ABIERTO', 'EN_PROCESO', 'EN_ESPERA', 'RESUELTO', 'CERRADO')),
  urgencia          varchar(20)  NOT NULL CHECK (urgencia IN ('URGENTE', 'MEDIA', 'BAJA', 'INDEFINIDA')),
  prioridad         varchar(10)  CHECK (prioridad IN ('ALTA', 'MEDIA', 'BAJA')),
  impacto           varchar(10)  CHECK (impacto IN ('ALTO', 'MEDIO', 'BAJO')),
  categoria         varchar(30)  CHECK (categoria IN (
                       'TRASPASO_FOLIO', 'REPOSICION', 'CARGA_ACTO',
                       'UNIFICACION_FOLIO', 'ACTUALIZACION_IMAGEN', 'INTEGRACION'
                     )),
  -- `remitente_id`/`destinatario_id` son NULLABLE (no como en el diseño
  -- original) porque la migración histórica de SID (db/migrate-tickets-sid.mjs)
  -- trae 13,760 tickets desde 2011, y varios de sus remitentes/destinatarios
  -- (usuarios de SID identificados por correo) todavía no tienen cuenta en
  -- PRISMA. Se prefiere migrar el ticket completo con la referencia en NULL
  -- (y el nombre original en *_legacy_nombre) a perder el registro o bloquear
  -- la migración hasta dar de alta a esa persona. Los tickets creados desde
  -- PRISMA en vivo (ticket-api.service.ts) siempre traen remitente_id.
  remitente_id          integer      REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  remitente_legacy_nombre varchar(255),
  destinatario_id          integer      REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  destinatario_legacy_nombre varchar(255),
  -- Solución: se admite mientras EN_PROCESO (avance, sin fecha_solucion) y es
  -- obligatoria (mín. 5 caracteres) para pasar a CERRADO — regla aplicada en
  -- el service, no aquí.
  solucion          text,
  fecha_solucion    timestamp,
  -- Auditoría: un renglón por cada cambio, con diff campo-por-campo y el
  -- actor completo (igual que el legacy `change_log` de SID).
  change_log        jsonb        NOT NULL DEFAULT '[]'::jsonb,
  last_action       varchar(50),
  last_modified_by  integer      REFERENCES usuarios (id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at        timestamp    NOT NULL DEFAULT now(),
  updated_at        timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_estado          ON tickets (estado);
CREATE INDEX IF NOT EXISTS idx_tickets_remitente_id     ON tickets (remitente_id);
CREATE INDEX IF NOT EXISTS idx_tickets_destinatario_id  ON tickets (destinatario_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_code      ON tickets (ticket_code);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at       ON tickets (created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_archivos (
  id             serial       PRIMARY KEY,
  -- id del archivo en `sid.ticket_file` — mismo propósito que tickets.origen_id.
  origen_id      integer      UNIQUE,
  ticket_id      integer      NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  file_path      varchar(500) NOT NULL,
  original_name  varchar(255) NOT NULL,
  file_size      integer      NOT NULL,
  file_type      varchar(20)  NOT NULL,
  created_at     timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_archivos_ticket_id ON ticket_archivos (ticket_id);

-- Contador atómico del folio mensual: un UPSERT (`ON CONFLICT DO UPDATE`) es
-- atómico en Postgres sin necesitar un `SELECT ... FOR UPDATE` explícito, a
-- diferencia de las dos queries separadas (`MAX(ticket_id)+1` y
-- `ORDER BY ticket_code DESC LIMIT 1`) que usaba SID.
CREATE TABLE IF NOT EXISTS ticket_code_counters (
  yymm varchar(4) PRIMARY KEY,
  seq  integer    NOT NULL DEFAULT 0
);

-- Aditivo sobre `notificaciones` (mismo patrón que oficio_id/tarea_id/
-- tramite_id/alerta_vigilancia_id): referencia opcional para el aviso in-app
-- de "te asignaron un ticket".
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS ticket_id integer REFERENCES tickets (id) ON DELETE CASCADE;

-- Nuevo módulo de menú: el acceso por usuario se otorga aparte, vía
-- `usuario_modulos` (Admin > Usuarios) — esta migración solo da de alta el
-- módulo en el catálogo, igual que el resto de `modulos`.
INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden)
VALUES (
  'tickets',
  'Tickets',
  'Mesa de ayuda interna: solicitudes de soporte, apertura y modificación de folios.',
  true,
  (SELECT COALESCE(MAX(orden), 0) + 1 FROM modulos)
)
ON CONFLICT (clave) DO NOTHING;
