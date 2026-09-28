-- Integración con la API de Consulta Pública de SID.
--
-- El histórico de `consulta_publica` se cargó una sola vez desde la base de
-- SID (db/migrate-consultas-sid.mjs). Mientras el kiosco siga registrando sus
-- búsquedas en SID, PRISMA se queda atrás: SID recibe ~11 búsquedas por
-- minuto. Esta tabla guarda la configuración del proceso que trae lo nuevo
-- desde la API de SID (src/integraciones/consultas.sync.ts).
--
-- Mismo patrón que `integracion_siqroo_config`: una sola fila (id = 1),
-- editable desde la interfaz, con el resultado de la última corrida a la
-- vista. Dos diferencias respecto a aquella:
--   · La API de SID no pide credencial (está abierta en la red interna), así
--     que no hay llave que cifrar. Si algún día le ponen autenticación, se
--     agrega aquí una columna `api_key_cifrada` como la de SIQROO.
--   · Se deja `activo = true` con la URL ya puesta, porque la dirección la
--     entregó el área de SID y el proceso solo lee. Para apagarlo basta con
--     poner `activo = false` desde la interfaz.
-- `origen_id_continuo` es la marca de agua del histórico: por debajo de ese id
-- ya se trajo TODO. No sirve `MAX(origen_id)` de consulta_publica para esto —
-- la sincronización guarda primero lo más nuevo (la API entrega en orden
-- descendente), así que el máximo salta al tope desde la primera página y
-- dejaría el rezago intermedio sin traer nunca. Solo se avanza la marca cuando
-- una corrida logra descender completa hasta ella.
CREATE TABLE IF NOT EXISTS integracion_consultas_config (
  id                    smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_base_url          text,
  activo                boolean NOT NULL DEFAULT false,
  origen_id_continuo    integer NOT NULL DEFAULT 0,
  ultima_sincronizacion timestamp,
  ultimo_estado         varchar(20),
  ultimo_detalle        text,
  actualizado_en        timestamp NOT NULL DEFAULT now(),
  actualizado_por_id    integer REFERENCES usuarios(id)
);

-- La marca arranca en el corte de la migración inicial (db/migrate-consultas-sid.mjs),
-- que sí trajo el histórico completo y sin huecos hasta ese id.
INSERT INTO integracion_consultas_config (id, api_base_url, activo, origen_id_continuo)
SELECT 1, 'http://10.1.100.128', true, COALESCE((SELECT MAX(origen_id) FROM consulta_publica), 0)
WHERE NOT EXISTS (SELECT 1 FROM integracion_consultas_config WHERE id = 1);
