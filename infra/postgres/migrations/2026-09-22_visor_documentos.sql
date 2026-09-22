-- Módulo Visor de Documentos: consulta, curaduría y transcripción de fojas
-- digitalizadas del acervo registral (RPPC).
--
-- Migración vía Strangler Fig desde dos fuentes locales (no repos de este
-- proyecto, solo insumo de análisis):
--   - SID (backend Laravel + visor Angular): visor de PDF estable, sin
--     modelo de datos normalizado de tomos/fojas — servía archivos por ruta
--     física fija (oficina/libro/archivo). Se rescató la navegación por
--     teclado, el cache de blobs y el merge/descarga de rango de páginas.
--   - VISAR (prototipo React/NestJS): aportó el modelo de datos normalizado
--     que se usa aquí (tomo→foja→imagen con múltiples versiones de
--     digitalización), la cascada de resolución de versión, la marca de
--     agua dinámica y el flujo de curaduría jurídica (dictamen de versión).
--
-- Estilo de esquema: varchar + CHECK en vez de tipos ENUM nativos, igual
-- que 2026-09-20_tickets.sql (un ENUM nativo no admite ALTER dentro de una
-- transacción y estos catálogos son razonablemente estables pero no fijos).
--
-- PRISMA no tenía, antes de esta migración, ningún catálogo de delegaciones/
-- secciones registrales normalizado (`catalogo_unidades` modela el
-- organigrama interno de PRISMA, no las oficinas del RPP) — por eso
-- `visor_delegaciones`/`visor_secciones` son catálogos nuevos y propios de
-- este módulo, no un alias de una tabla existente.
--
-- Fuera de este alcance a propósito: la migración real de imágenes desde
-- SID (quedaría en db/migrate-visor-sid.mjs, mismo patrón idempotente de
-- db/migrate-tickets-sid.mjs) — esta migración solo prepara el esquema;
-- `origen_id` en tomos/fojas ya queda listo para esa migración futura.
--
-- IDEMPOTENTE.

CREATE TABLE IF NOT EXISTS visor_delegaciones (
  id      serial       PRIMARY KEY,
  nombre  varchar(150) NOT NULL UNIQUE,
  activo  boolean      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS visor_secciones (
  id      serial       PRIMARY KEY,
  numero  smallint     NOT NULL UNIQUE,
  nombre  varchar(100) NOT NULL
);

INSERT INTO visor_secciones (numero, nombre) VALUES
  (1, 'Sección Primera'),
  (2, 'Sección Segunda'),
  (3, 'Sección Tercera'),
  (4, 'Sección Cuarta')
ON CONFLICT (numero) DO NOTHING;

CREATE TABLE IF NOT EXISTS visor_tomos (
  id                  serial       PRIMARY KEY,
  -- id del tomo en el origen SID, para la futura migración idempotente/reanudable.
  origen_id           integer      UNIQUE,
  delegacion_id       integer      NOT NULL REFERENCES visor_delegaciones (id),
  seccion_id          integer      NOT NULL REFERENCES visor_secciones (id),
  numero_romano       varchar(50)  NOT NULL,
  indice_orden        integer      NOT NULL,
  anio_registro        integer     NOT NULL,
  -- Ubicación física en el Centro de Acervo Registral (CEAR).
  cajon               varchar(50),
  id_libro            integer,
  inscripcion_inicial integer,
  inscripcion_final   integer,
  created_at          timestamp    NOT NULL DEFAULT now(),
  UNIQUE (delegacion_id, seccion_id, indice_orden)
);

CREATE INDEX IF NOT EXISTS idx_visor_tomos_delegacion_seccion ON visor_tomos (delegacion_id, seccion_id);
CREATE INDEX IF NOT EXISTS idx_visor_tomos_numero_romano      ON visor_tomos (numero_romano);

CREATE TABLE IF NOT EXISTS visor_fojas (
  id               serial       PRIMARY KEY,
  origen_id        integer      UNIQUE,
  tomo_id          integer      NOT NULL REFERENCES visor_tomos (id) ON DELETE CASCADE,
  numero_foja      varchar(50)  NOT NULL,
  inscripcion      varchar(255),
  orden_secuencial integer      NOT NULL,
  created_at       timestamp    NOT NULL DEFAULT now(),
  UNIQUE (tomo_id, numero_foja)
);

CREATE INDEX IF NOT EXISTS idx_visor_fojas_tomo_orden ON visor_fojas (tomo_id, orden_secuencial);

-- Una foja puede tener varias digitalizaciones históricas (V2009, V2022
-- —incompleta—, V3 —la revisión validada—). Cuál de ellas es la oficial la
-- decide un dictamen jurídico (visor_dictamenes_versiones_foja), no el
-- orden de captura.
CREATE TABLE IF NOT EXISTS visor_imagenes_foja (
  id              serial       PRIMARY KEY,
  foja_id         integer      NOT NULL REFERENCES visor_fojas (id) ON DELETE CASCADE,
  version         varchar(20)  NOT NULL CHECK (version IN ('V2009', 'V2022_FALTANTE', 'V3_VALIDADA')),
  ruta_storage    varchar(1024) NOT NULL,
  formato         varchar(20)  NOT NULL DEFAULT 'tif',
  subido_por_id   integer      REFERENCES usuarios (id) ON DELETE SET NULL,
  created_at      timestamp    NOT NULL DEFAULT now(),
  UNIQUE (foja_id, version)
);

-- Curaduría jurídica: qué versión de digitalización es la válida para una
-- foja, y por qué. Sin esta fila, la resolución de versión cae a la
-- cascada automática (ver visor.imagen.service.ts).
CREATE TABLE IF NOT EXISTS visor_dictamenes_versiones_foja (
  id                     serial       PRIMARY KEY,
  foja_id                integer      NOT NULL UNIQUE REFERENCES visor_fojas (id) ON DELETE CASCADE,
  version_seleccionada   varchar(20)  NOT NULL CHECK (version_seleccionada IN ('V2009', 'V2022_FALTANTE', 'V3_VALIDADA')),
  justificacion_juridica text         NOT NULL,
  usuario_id             integer      NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
  fecha_dictamen         timestamp    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visor_transcripciones_foja (
  id                  serial       PRIMARY KEY,
  foja_id             integer      NOT NULL UNIQUE REFERENCES visor_fojas (id) ON DELETE CASCADE,
  texto_transcrito    text         NOT NULL,
  origen              varchar(10)  NOT NULL CHECK (origen IN ('IA', 'HUMANO')),
  modelo_ia           varchar(255),
  creado_por          integer      NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
  ultimo_editor_id     integer      REFERENCES usuarios (id) ON DELETE SET NULL,
  fecha_actualizacion timestamp    NOT NULL DEFAULT now()
);

-- Nuevo módulo de menú: el acceso por usuario se otorga aparte, vía
-- `usuario_modulos` (Admin > Usuarios) — esta migración solo da de alta el
-- módulo en el catálogo, igual que el resto de `modulos`. No se otorga a
-- PARTICULAR por defecto: es una herramienta operativa (curaduría jurídica,
-- transcripción), del mismo tipo que `tickets`/`folios_salida`.
INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden)
VALUES (
  'visor_documentos',
  'Visor de Documentos',
  'Consulta, curaduría y transcripción de fojas digitalizadas del acervo registral.',
  true,
  (SELECT COALESCE(MAX(orden), 0) + 1 FROM modulos)
)
ON CONFLICT (clave) DO NOTHING;
