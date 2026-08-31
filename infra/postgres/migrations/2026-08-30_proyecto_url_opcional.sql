-- `gestiones_contestacion.proyecto_url` deja de ser obligatoria.
--
-- El proyecto de contestación es el borrador que redacta el área. Hay dos
-- momentos en que el sistema lo borra a propósito, y en ambos suelta la
-- referencia poniendo la columna en NULL:
--
--   1. Al subir el escaneado firmado (`finalizarOficio`): con el firmado de por
--      medio el borrador ya no vale, y dejarlo se presta a que alguien lo
--      confunda con el documento oficial.
--
--   2. Al aceptar un turno por competencia (`aceptarTurno`): el proyecto que
--      redactó el área anterior no le sirve a la que recibe, y peor: podría
--      firmarse un texto que esa área no escribió.
--
-- El código hace las dos cosas desde el commit 592a18a, pero la columna nació
-- NOT NULL en `init/00_schema.sql` y nunca se relajó. Resultado: cada intento
-- de subir el firmado moría con
--
--   null value in column "proyecto_url" ... violates not-null constraint
--
-- y el oficio se quedaba atorado en VOBO_APROBADO. La transacción entera se
-- revierte, así que no hay datos a medias que reparar — solo oficios detenidos
-- que podrán cerrarse en cuanto corra esto.
--
-- Del lado de la lectura no hay nada que ajustar: `serveFile` ya recibe
-- `string | null` y responde 404 «Proyecto de contestación no disponible», y la
-- consulta de bandejas ya filtra con `proyecto_url IS NOT NULL`. La columna se
-- venía tratando como opcional en todos lados menos en su propia definición.

ALTER TABLE gestiones_contestacion
  ALTER COLUMN proyecto_url DROP NOT NULL;

COMMENT ON COLUMN gestiones_contestacion.proyecto_url IS
  'Borrador de contestación. NULL cuando aún no se sube, cuando se reemplazó por el escaneado firmado, o cuando el oficio cambió de área por competencia.';
