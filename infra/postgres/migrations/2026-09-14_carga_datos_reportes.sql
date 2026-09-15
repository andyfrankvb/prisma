-- Módulo "Carga de Datos (Reportes)" — quien lo tenga asignado puede subir
-- los reportes SATQ, editar la estimación de SEFIPLAN, y configurar la
-- integración con la API de SIQROO (cuando esté lista). Separado del módulo
-- "reportes_satq" (que solo ve los reportes) a propósito: alguien puede
-- necesitar cargar datos sin necesariamente ver los reportes, o viceversa.

INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden)
SELECT 'carga_datos_reportes',
       'Carga de Datos (Reportes)',
       'Subir reportes SATQ, editar la estimación de SEFIPLAN y configurar la sincronización con SIQROO',
       true,
       7
WHERE NOT EXISTS (SELECT 1 FROM modulos WHERE clave = 'carga_datos_reportes');

-- Bitácora de todas las cargas/ediciones/sincronizaciones — quién, cuándo,
-- cuántas filas, y el detalle. Es dinero público: conviene que quede trazado.
CREATE TABLE IF NOT EXISTS carga_datos_log (
  id               bigserial PRIMARY KEY,
  tipo             varchar(30) NOT NULL,  -- 'satq_ingresos' | 'estimacion_sefiplan' | 'sync_siqroo'
  usuario_id       integer REFERENCES usuarios(id),
  archivo_nombre   varchar(255),
  filas_nuevas     integer,
  filas_actualizadas integer,
  filas_total      integer,
  fecha_desde      date,
  fecha_hasta      date,
  estado           varchar(20) NOT NULL,  -- 'exitoso' | 'error'
  detalle          text,
  creado_en        timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_carga_datos_log_tipo ON carga_datos_log(tipo);
CREATE INDEX IF NOT EXISTS idx_carga_datos_log_creado ON carga_datos_log(creado_en);

-- Staging para la carga de reportes SATQ — se trunca y se vuelve a llenar en
-- cada carga (preview o confirmación), así el diff contra satq_ingresos se
-- calcula con una consulta SQL en vez de comparar 100k+ filas en JS.
CREATE TABLE IF NOT EXISTS stg_satq_ingresos_carga (
  referencia        varchar(30)  NOT NULL,
  no_operacion      varchar(30)  NOT NULL,
  fecha_contable    date         NOT NULL,
  municipio         varchar(60)  NOT NULL,
  id_concepto       integer      NOT NULL,
  concepto          text         NOT NULL,
  importe           numeric(14,2) NOT NULL,
  total_referencia  numeric(14,2) NOT NULL
);

-- Llave natural para poder hacer UPSERT real en vez de re-cargar todo cada
-- vez (verificado: las 631,312 filas actuales ya cumplen esta combinación
-- única, así que la restricción no falla al aplicarse). Postgres no soporta
-- "ADD CONSTRAINT IF NOT EXISTS", así que se checa contra pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_satq_ingresos_operacion_concepto'
  ) THEN
    ALTER TABLE satq_ingresos
      ADD CONSTRAINT uq_satq_ingresos_operacion_concepto UNIQUE (no_operacion, id_concepto);
  END IF;
END $$;

-- Configuración de la integración con la API de SIQROO. Fila única (id=1).
-- `api_key_cifrada` se cifra con AES-256-GCM (ver src/utils/crypto.ts) — nunca
-- se guarda ni se devuelve en texto plano; `api_key_ultimos4` es solo para
-- mostrar "termina en ****1234" en la pantalla sin exponer la key completa.
CREATE TABLE IF NOT EXISTS integracion_siqroo_config (
  id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_base_url         text,
  api_key_cifrada      text,
  api_key_ultimos4     varchar(4),
  activo               boolean NOT NULL DEFAULT false,
  ultima_sincronizacion timestamp,
  ultimo_estado        varchar(20),
  ultimo_detalle       text,
  actualizado_en       timestamp NOT NULL DEFAULT now(),
  actualizado_por_id   integer REFERENCES usuarios(id)
);
INSERT INTO integracion_siqroo_config (id, activo)
SELECT 1, false
WHERE NOT EXISTS (SELECT 1 FROM integracion_siqroo_config WHERE id = 1);
