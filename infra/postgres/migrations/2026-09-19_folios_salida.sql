-- Folio de salida — consecutivo del oficio de respuesta (Oficialía de Partes).
--
-- ── Por qué esto NO es lo mismo que `oficios.folio` ──────────────────────────
--
-- `oficios.folio` (OF-DDMMAAAA-CODIGO-NNNN, ver 2026-09-10_codigo_folio_por_unidad.sql)
-- es el número de control de ENTRADA: lo asigna la Oficialía al capturar el
-- oficio que llega. Es un dato de PRISMA, no de SID, y no se toca aquí.
--
-- Esta tabla es el número de SALIDA: el consecutivo legal que lleva el oficio
-- de RESPUESTA que redacta el Analista Jurídico y firma/formaliza el Director
-- Jurídico — el mismo consecutivo que hasta ahora generaba el módulo de Folios
-- de SID (`folios`/`registros`, formato SEGOB/DGRPPC/…). PRISMA no tenía
-- ningún equivalente: `gestiones_contestacion` solo guardaba el archivo del
-- proyecto y el del firmado, nunca un número de salida.
--
-- ── Por qué una tabla aparte y no columnas en `gestiones_contestacion` ───────
--
-- Un folio se puede reservar antes de que exista un proyecto (el Analista lo
-- pide al capturar su borrador) y formalizar después (el Director Jurídico, al
-- dar el VoBo) — dos momentos, dos usuarios, y potencialmente dos folios si el
-- primero se cancela. Vive aparte para poder tener su propio ciclo de vida
-- (RESERVADO → ASIGNADO → CANCELADO) sin forzar esos estados en la tabla de
-- gestión, que ya tiene los suyos.
--
-- ── Por qué el consecutivo es una SECUENCIA GLOBAL y no por área/año ─────────
--
-- SID lo generaba así — `Folio::max('num_folio') + 1`, un entero que nunca se
-- reinicia — y la migración a producción exige continuar exactamente ahí: el
-- primer folio que emita PRISMA debe ser el siguiente al último real de SID,
-- no un 0001 nuevo. Ver db/migrate-folios-sid.mjs para la reconciliación.
--
-- IDEMPOTENTE.

CREATE SEQUENCE IF NOT EXISTS folio_salida_consecutivo_seq;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estatus_folio_salida') THEN
    CREATE TYPE estatus_folio_salida AS ENUM ('RESERVADO', 'ASIGNADO', 'CANCELADO');
  END IF;
END $$;

-- Live y legacy conviven en una sola tabla: así "el historial completo" es una
-- sola consulta y no un UNION disperso por el código (que es justo el patrón
-- que se quiere dejar atrás de FolioController::index1 en SID).
CREATE TABLE IF NOT EXISTS folios_salida (
  id                  SERIAL PRIMARY KEY,

  -- NULL solo en filas legacy: los folios migrados de SID no tienen un oficio
  -- correspondiente en PRISMA (SID no conocía el concepto de "oficio" de este
  -- módulo). Ver el CHECK de abajo.
  oficio_id           INTEGER REFERENCES oficios (id) ON DELETE CASCADE,

  consecutivo         INTEGER      NOT NULL,
  folio_formateado    VARCHAR(160) NOT NULL,
  -- 'JURIDICO' | 'DIRECTOR_JURIDICO' (plantillas vigentes) | 'LEGACY' (folios
  -- migrados cuyo rol de origen no se puede reconstruir con certeza — ver
  -- migrate-folios-sid.mjs).
  rol_formato         VARCHAR(30)  NOT NULL,
  anio                INTEGER      NOT NULL,
  mes_romano          VARCHAR(4)   NOT NULL,

  estatus             estatus_folio_salida NOT NULL DEFAULT 'RESERVADO',

  reservado_por_id    INTEGER REFERENCES usuarios (id),
  reservado_en        TIMESTAMPTZ,
  asignado_por_id     INTEGER REFERENCES usuarios (id),
  asignado_en         TIMESTAMPTZ,
  cancelado_por_id    INTEGER REFERENCES usuarios (id),
  cancelado_en        TIMESTAMPTZ,
  motivo_cancelacion  TEXT,

  -- Identidad de origen para lo migrado de SID. `origen_sid_tabla` distingue
  -- la tabla estructurada ('folios') del archivo previo a ella ('registros'),
  -- que traía su propia numeración y no comparte formato.
  es_legacy           BOOLEAN      NOT NULL DEFAULT FALSE,
  origen_sid_tabla    VARCHAR(20),
  origen_sid_id       INTEGER,

  creado_en           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_folio_salida_legacy_o_vivo CHECK (
    (es_legacy AND origen_sid_id IS NOT NULL)
    OR (NOT es_legacy AND oficio_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_folio_salida_formateado
  ON folios_salida (folio_formateado);

CREATE UNIQUE INDEX IF NOT EXISTS uq_folio_salida_origen_sid
  ON folios_salida (origen_sid_tabla, origen_sid_id) WHERE es_legacy;

-- Un oficio no puede tener dos folios de salida vivos a la vez (sí puede tener
-- uno cancelado y otro vigente: por eso el índice excluye CANCELADO).
CREATE UNIQUE INDEX IF NOT EXISTS uq_folio_salida_oficio_activo
  ON folios_salida (oficio_id) WHERE NOT es_legacy AND estatus <> 'CANCELADO';

CREATE INDEX IF NOT EXISTS idx_folio_salida_legacy ON folios_salida (es_legacy);

-- Trazabilidad imborrable: un renglón por cada paso del ciclo de vida del
-- folio, con quién, con qué rol y sobre qué versión del proyecto. No vive
-- dentro de `auditoria_estados` (esa tabla es de estatus de OFICIO, no de
-- folio) — misma razón por la que `oficio_correcciones` es aparte.
CREATE TABLE IF NOT EXISTS folio_salida_historial (
  id                SERIAL PRIMARY KEY,
  folio_salida_id   INTEGER NOT NULL REFERENCES folios_salida (id) ON DELETE CASCADE,
  oficio_id         INTEGER REFERENCES oficios (id) ON DELETE CASCADE,
  fecha_evento      TIMESTAMPTZ NOT NULL DEFAULT now(),
  evento            VARCHAR(20) NOT NULL,  -- RESERVADO | ASIGNADO | CANCELADO | MIGRADO_SID
  usuario_id        INTEGER REFERENCES usuarios (id),
  rol_usuario       VARCHAR(20),
  estado_oficio     estatus_oficio,
  version_proyecto  INTEGER,
  hash_documento    VARCHAR(128)
);
CREATE INDEX IF NOT EXISTS idx_folio_salida_historial_folio
  ON folio_salida_historial (folio_salida_id, fecha_evento);

-- Enlace opcional desde la gestión de contestación hacia su folio de salida.
-- Aditivo: no reescribe ni exige nada de lo que ya existe en la tabla.
ALTER TABLE gestiones_contestacion
  ADD COLUMN IF NOT EXISTS folio_salida_id INTEGER REFERENCES folios_salida (id);

COMMENT ON TABLE folios_salida IS
  'Consecutivo del oficio de RESPUESTA (Analista Jurídico / Director Jurídico). Sucesor del módulo de Folios de SID. No confundir con oficios.folio, que es el número de control de ENTRADA.';
