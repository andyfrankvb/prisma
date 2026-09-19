-- Consulta Pública SIQROO: histórico de búsquedas hechas por el público.
-- Migrado desde SID (backend/app/Models/Consulta.php, tabla `consulta_publica`,
-- controladores APITurnos::listarConsultas y APITurnos::crearConsulta).
--
-- Esquema LIMPIO respecto al legacy — verificado contra la tabla real de SID
-- (73,753 filas, 2026-07-07 a 2026-09-08). Columnas del legacy que NO se
-- replican, y por qué:
--   · nombres, apellido   → siempre se usan solo para componer nombre_completo
--                           (`trim(nombres.' '.apellido)`); nunca se leen por
--                           separado en ningún consumidor (ni la UI ni la API).
--   · fecha_registro      → default de BD (`now()`) redundante con
--                           hora_busqueda (puesto explícitamente por la app),
--                           con ~5h de desfase de huso horario entre ambas
--                           (BD en UTC vs app en hora de Quintana Roo). Ningún
--                           consumidor la lee.
--   · usuario, tramite    → 99.9% constantes en la data real (correlacionados
--                           1 a 1: PUBLICO↔CONSULTA PUBLICA TEMPORAL,
--                           USUARIO_RPPC↔CONSULTA PUBLICA USUARIO RPPC) y
--                           redundantes con `tipo_usuario`, que ya trae la
--                           misma distinción con más detalle (p.ej. "Usuario
--                           RPPC: Calificador").
--
-- `oficina` es TEXTO en el legacy (no entero) — se corrige respecto a una
-- migración anterior de esta misma tabla que lo tipó mal como `integer`.
--
-- `origen_id`: id del registro en SID, para la migración de datos
-- (db/migrate-consultas-sid.mjs) — permite reintentarla sin duplicar filas.
-- Nulo en los registros creados nativamente en PRISMA después del corte.
CREATE TABLE IF NOT EXISTS consulta_publica (
  id              serial       PRIMARY KEY,
  origen_id       integer      UNIQUE,
  nombre_completo varchar(255) NOT NULL,
  codigo_acceso   varchar(100) NOT NULL,
  busqueda        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  filtro_busqueda varchar(255),
  tipo_usuario    varchar(100),
  oficina         varchar(100),
  folio           varchar(255),
  estado_contador varchar(20),
  hora_busqueda   timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consulta_publica_codigo_acceso  ON consulta_publica(codigo_acceso);
CREATE INDEX IF NOT EXISTS idx_consulta_publica_oficina        ON consulta_publica(oficina);
CREATE INDEX IF NOT EXISTS idx_consulta_publica_hora_busqueda  ON consulta_publica(hora_busqueda DESC);
