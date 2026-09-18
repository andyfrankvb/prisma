-- Máquinas: catálogo operativo de equipos de captura/atención por oficina
-- registral. Migrado desde SID (tabla `maquina`, Laravel Model App\Models\Maquina)
-- — mismo esquema: numero_maquina único, oficina de texto libre (ver
-- delegaciones en maquina.component.ts del legacy), libre indica si está
-- disponible u ocupada.
CREATE TABLE IF NOT EXISTS maquina (
  id_maquina     serial PRIMARY KEY,
  numero_maquina varchar(50)  NOT NULL,
  oficina        varchar(255) NOT NULL,
  libre          boolean      NOT NULL DEFAULT true,
  fecha_registro timestamp    NOT NULL DEFAULT now(),
  CONSTRAINT maquina_numero_maquina_unique UNIQUE (numero_maquina)
);

CREATE INDEX IF NOT EXISTS idx_maquina_oficina ON maquina(oficina);
