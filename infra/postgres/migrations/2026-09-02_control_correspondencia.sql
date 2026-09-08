-- Módulo «Control de Correspondencia»: rastreo físico de los paquetes.
--
-- ── Qué problema resuelve ────────────────────────────────────────────────────
--
-- Al Registro llegan oficios CON DOCUMENTOS ORIGINALES, que muchas veces hay que
-- devolver a quien los mandó. Se reciben en cualquiera de las cinco oficinas y el
-- papel tiene que viajar hasta la persona a la que va dirigido. PRISMA sabía todo
-- del expediente digital y nada de dónde estaba el papel: no existe una sola
-- columna sobre el documento físico —`pdf_original_path` es el escaneo y
-- `dirigido_a_original_id` es el destinatario previo a un turnado—.
--
-- Las tablas de movimiento que ya existen (`oficio_turnos`, `oficio_delegatorios`,
-- `oficio_pases_firma`, `auditoria_estados`) registran el flujo LÓGICO: de qué área
-- a qué área pasó la responsabilidad. Esto es otro eje: por qué manos pasó el
-- sobre. Un oficio puede estar asignado a Tania en Jurídica mientras el papel sigue
-- en Chetumal. Por eso son tablas nuevas y no columnas de las viejas.
--
-- ── Las decisiones que quedan grabadas aquí ──────────────────────────────────
--
--   · UN PAQUETE, UNA PERSONA. No un área: una persona con nombre. Si a una
--     oficina van documentos para tres, son tres paquetes que viajan juntos pero
--     se rastrean por separado. Cada destinatario da su propio código.
--   · VARIOS OFICIOS DENTRO, tomados de los ya capturados. No se recaptura nada.
--   · POCO RIGUROSO A PROPÓSITO. Los pasos intermedios no llevan doble
--     confirmación ni credencial: un escaneo del QR y un toque. El enemigo real no
--     es que alguien mienta sobre un traslado, es que nadie registre porque
--     estorba. Cada segundo de fricción se paga en pasos sin registrar.
--   · EL CÓDIGO SOLO PROTEGE LA ENTREGA. Es el único momento que puede tener que
--     probarse después, y ocurre una vez por paquete, no una por paso.
--
-- ── Lo que esta migración NO hace ────────────────────────────────────────────
--
-- No agrega nada a `oficios`. Si más adelante se quiere marcar desde la recepción
-- que un oficio trae originales y que deben devolverse, son dos columnas nuevas
-- que no obligan a rehacer esto.

-- ── Tabla 1: los paquetes ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS paquetes (
  id                SERIAL PRIMARY KEY,

  -- PAQ-02_09_2026-0001, en la misma forma que los folios de oficio. Es lo que
  -- viaja dentro del QR y lo que la gente dicta por teléfono.
  folio             VARCHAR(40)  NOT NULL UNIQUE,

  -- A QUIÉN va. Una persona, no un área.
  destinatario_id   INTEGER      NOT NULL REFERENCES usuarios (id)
                                 ON UPDATE CASCADE ON DELETE RESTRICT,

  creado_por_id     INTEGER      NOT NULL REFERENCES usuarios (id)
                                 ON UPDATE CASCADE ON DELETE RESTRICT,

  -- De dónde sale. Se guarda al armarlo porque quien lo creó puede cambiar de
  -- adscripción después, y entonces el origen del paquete cambiaría solo.
  unidad_origen_id  INTEGER          REFERENCES catalogo_unidades (id)
                                 ON UPDATE CASCADE ON DELETE SET NULL,

  --   ABIERTO      se está armando, no ha salido; se le agregan y quitan oficios
  --   EN_TRANSITO  cerrado y en camino; aquí se acumulan los pasos
  --   ENTREGADO    el destinatario lo recibió con su código; fin del recorrido
  --   CANCELADO    se armó por error y nunca salió
  estado            VARCHAR(20)  NOT NULL DEFAULT 'ABIERTO'
                    CHECK (estado IN ('ABIERTO','EN_TRANSITO','ENTREGADO','CANCELADO')),

  -- Cuatro dígitos que solo conoce el destinatario. Se generan al CERRAR, no al
  -- crear: mientras el paquete está abierto todavía puede cancelarse, y no tiene
  -- sentido avisarle a alguien de algo que quizá no salga.
  codigo_recepcion  VARCHAR(8),

  -- Quién confirmó la recepción. Casi siempre es el destinatario, pero se guarda
  -- aparte a propósito: si más adelante se permite que alguien reciba por él, el
  -- dato ya tiene dónde vivir y no se pierde quién firmó de verdad.
  recibido_por_id   INTEGER          REFERENCES usuarios (id)
                                 ON UPDATE CASCADE ON DELETE SET NULL,

  observaciones     TEXT,
  motivo_cancelacion TEXT,

  creado_en         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  cerrado_en        TIMESTAMPTZ,
  entregado_en      TIMESTAMPTZ,
  cancelado_en      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_paquetes_destinatario ON paquetes (destinatario_id);
CREATE INDEX IF NOT EXISTS idx_paquetes_estado       ON paquetes (estado);
CREATE INDEX IF NOT EXISTS idx_paquetes_creado_por   ON paquetes (creado_por_id);

COMMENT ON TABLE  paquetes IS
  'Correspondencia física en tránsito. Un paquete va dirigido a UNA persona y lleva varios oficios.';
COMMENT ON COLUMN paquetes.codigo_recepcion IS
  'Cuatro dígitos que solo conoce el destinatario. Se genera al cerrar y se le avisa por notificación.';

-- ── Tabla 2: qué va dentro ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS paquete_oficios (
  id            SERIAL PRIMARY KEY,
  paquete_id    INTEGER     NOT NULL REFERENCES paquetes (id)
                            ON UPDATE CASCADE ON DELETE CASCADE,
  oficio_id     INTEGER     NOT NULL REFERENCES oficios (id)
                            ON UPDATE CASCADE ON DELETE CASCADE,
  agregado_por_id INTEGER       REFERENCES usuarios (id)
                            ON UPDATE CASCADE ON DELETE SET NULL,
  agregado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (paquete_id, oficio_id)
);

CREATE INDEX IF NOT EXISTS idx_paquete_oficios_oficio ON paquete_oficios (oficio_id);

/*
 * Un oficio no puede viajar en dos paquetes A LA VEZ.
 *
 * El papel es uno solo: si el sistema lo permitiera, estaría afirmando que está en
 * dos lugares. Pero SÍ puede ir en varios a lo largo del tiempo —va, se entrega, y
 * meses después se devuelve al remitente en otro paquete—, así que la restricción
 * no puede ser sobre la tabla entera.
 *
 * El índice parcial resuelve justo eso: solo cuenta mientras el paquete siga vivo.
 * Se apoya en una subconsulta, cosa que un índice no admite, así que va como
 * disparador. Es la forma de que la regla viva en la base y no solo en el
 * controlador, donde una segunda pantalla podría saltársela sin enterarse.
 */
CREATE OR REPLACE FUNCTION paquete_oficio_no_duplicado() RETURNS trigger AS $$
DECLARE
  otro TEXT;
BEGIN
  SELECT p.folio INTO otro
    FROM paquete_oficios po
    JOIN paquetes p ON p.id = po.paquete_id
   WHERE po.oficio_id = NEW.oficio_id
     AND po.paquete_id <> NEW.paquete_id
     AND p.estado IN ('ABIERTO','EN_TRANSITO')
   LIMIT 1;

  IF otro IS NOT NULL THEN
    RAISE EXCEPTION 'Ese oficio ya viaja en el paquete %', otro
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_paquete_oficio_no_duplicado ON paquete_oficios;
CREATE TRIGGER trg_paquete_oficio_no_duplicado
  BEFORE INSERT ON paquete_oficios
  FOR EACH ROW EXECUTE FUNCTION paquete_oficio_no_duplicado();

-- ── Tabla 3: la bitácora ─────────────────────────────────────────────────────

/*
 * Un renglón por evento. De aquí sale TODO lo que se muestra del recorrido, y en
 * particular quién trae el paquete ahora: es el último movimiento.
 *
 * Deliberadamente NO se guarda un `custodio_actual_id` en `paquetes`. Serían dos
 * fuentes para el mismo dato y tarde o temprano dirían cosas distintas — es
 * exactamente el error que se corrigió esta semana en las bandejas, donde la misma
 * regla escrita en tres lugares tenía una versión desincronizada.
 */
CREATE TABLE IF NOT EXISTS paquete_movimientos (
  id           SERIAL PRIMARY KEY,
  paquete_id   INTEGER     NOT NULL REFERENCES paquetes (id)
                           ON UPDATE CASCADE ON DELETE CASCADE,

  --   CREADO     se armó
  --   CERRADO    salió; a partir de aquí corre el rastreo
  --   TRASLADO   alguien escaneó y dijo «lo traigo yo»
  --   ENTREGADO  el destinatario lo recibió con su código
  --   CANCELADO  se deshizo antes de salir
  tipo         VARCHAR(20) NOT NULL
               CHECK (tipo IN ('CREADO','CERRADO','TRASLADO','ENTREGADO','CANCELADO')),

  /*
   * Quién lo hizo. Es NULO a propósito en los traslados.
   *
   * La página del escaneo no pide iniciar sesión —las sesiones duran 8 horas y
   * exigirla significaría teclear la contraseña casi a diario en el teléfono, que
   * es justo lo que haría que la gente dejara de registrar—. Así que la identidad
   * en los pasos intermedios es DECLARADA: quien escanea elige su nombre la
   * primera vez y el navegador lo recuerda.
   *
   * Cuando se elige de la lista, aquí queda su id. `nombre_declarado` guarda lo
   * que se escribió cuando la persona no está en el sistema —un mensajero
   * externo—, que es el caso que justifica no exigir cuenta.
   *
   * Es bitácora, no constancia: sirve para saber por dónde anduvo y a quién
   * preguntarle, no para deslindar responsabilidades en un procedimiento formal.
   * Si algún día hiciera falta lo segundo, se agrega un NIP por persona sin
   * rehacer nada de esto.
   */
  usuario_id       INTEGER      REFERENCES usuarios (id)
                                ON UPDATE CASCADE ON DELETE SET NULL,
  nombre_declarado VARCHAR(160),

  -- Dónde ocurrió, si se pudo saber. Sale de la unidad del usuario elegido.
  unidad_id    INTEGER          REFERENCES catalogo_unidades (id)
                            ON UPDATE CASCADE ON DELETE SET NULL,

  nota         TEXT,
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paquete_mov_paquete ON paquete_movimientos (paquete_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_paquete_mov_usuario ON paquete_movimientos (usuario_id);

COMMENT ON TABLE paquete_movimientos IS
  'Bitácora del recorrido. El último renglón dice quién trae el paquete ahora.';

-- ── El contador de folios ────────────────────────────────────────────────────

/*
 * Consecutivo diario, igual que el de los oficios: se toma dentro de la misma
 * transacción que guarda el paquete, con INSERT ... ON CONFLICT DO UPDATE
 * RETURNING, para que dos altas simultáneas no se lleven el mismo número y para
 * que un fallo posterior devuelva el consecutivo en lugar de dejar un hueco.
 *
 * Va en su propia tabla y no en `folio_secuencia`: los paquetes llevan su propia
 * numeración, y compartirla haría que registrar un oficio consumiera folios de
 * paquete y al revés.
 */
CREATE TABLE IF NOT EXISTS paquete_secuencia (
  fecha  DATE    PRIMARY KEY,
  ultimo INTEGER NOT NULL
);

COMMENT ON TABLE paquete_secuencia IS
  'Consecutivo diario de folios de paquete. Una fila por día.';

-- ── El módulo ────────────────────────────────────────────────────────────────

INSERT INTO modulos (clave, nombre_display, descripcion, activo, orden)
SELECT 'control_correspondencia',
       'Control de Correspondencia',
       'Armar paquetes de oficios, rastrear por dónde pasan y registrar su entrega.',
       true,
       6
WHERE NOT EXISTS (SELECT 1 FROM modulos WHERE clave = 'control_correspondencia');

-- ── La clave del QR ──────────────────────────────────────────────────────────

/*
 * El QR NO lleva el folio, lleva esta clave.
 *
 * El folio es legible y secuencial —PAQ-02_09_2026-0001— justamente para poder
 * dictarlo por teléfono. Eso lo vuelve adivinable, y como la página del escaneo no
 * pide iniciar sesión, cualquiera podría ir probando números y ensuciar la bitácora
 * de paquetes ajenos: registrar traslados que no ocurrieron, o intentar entregas.
 *
 * Con una clave aleatoria, para escribir en el recorrido de un paquete hay que
 * tener su QR enfrente. Que es, exactamente, tener el paquete en la mano.
 *
 * El folio se conserva para las personas; la clave es para las máquinas.
 */
-- `gen_random_uuid()` y no `gen_random_bytes()`: la segunda vive en pgcrypto, que
-- esta base no tiene habilitada. La primera viene incluida en PostgreSQL desde la
-- versión 13, es criptográficamente fuerte, y va como valor por omisión para que
-- la aplicación no tenga que acordarse de generarla.
ALTER TABLE paquetes ADD COLUMN IF NOT EXISTS token VARCHAR(48);

-- El DEFAULT va en su propia sentencia y no dentro del ADD COLUMN: si la columna
-- ya existía, `IF NOT EXISTS` se salta TODO el ADD —incluido el valor por
-- omisión— y las filas nuevas nacerían sin token. Así la migración se puede
-- volver a correr sin dejar el arreglo a medias.
ALTER TABLE paquetes ALTER COLUMN token
  SET DEFAULT replace(gen_random_uuid()::text, '-', '');

UPDATE paquetes SET token = replace(gen_random_uuid()::text, '-', '') WHERE token IS NULL;

ALTER TABLE paquetes ALTER COLUMN token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_paquetes_token ON paquetes (token);

COMMENT ON COLUMN paquetes.token IS
  'Clave aleatoria que viaja en el QR. Identifica el paquete en las rutas públicas, que no piden sesión.';

-- ── Un paquete puede llevar cosas que NO están en PRISMA ─────────────────────

/*
 * `paquete_oficios` pasa a llamarse `paquete_contenido`, y su `oficio_id` deja de
 * ser obligatorio.
 *
 * El módulo se pensó para mover oficios ya capturados, pero en la práctica en el
 * mismo sobre viajan cosas que nunca entraron al sistema: un acuse, un plano, un
 * expediente de otro trámite, una memoria USB. Si el paquete solo admitiera
 * oficios de PRISMA, esas cosas viajarían sin registrar —o peor, alguien las
 * dejaría fuera del paquete para no pelearse con el formulario—.
 *
 * Cada renglón es entonces UNA de dos cosas, nunca las dos ni ninguna:
 *   · un oficio del sistema  → `oficio_id`
 *   · algo descrito a mano   → `descripcion`
 *
 * El nombre cambia porque «oficios» ya no dice lo que la tabla guarda. Se hace
 * ahora, que nada depende de ella todavía; dentro de un año sería una molestia.
 */
/*
 * El cambio de nombre va dentro de un bloque y no como un ALTER suelto para que
 * el archivo se pueda volver a correr.
 *
 * Arriba, `CREATE TABLE IF NOT EXISTS paquete_oficios` mira el nombre VIEJO. En
 * una segunda pasada ese nombre ya no existe —se renombró en la primera—, así
 * que el CREATE lo da por bueno y resucita la tabla vacía; el rename de después
 * chocaba entonces contra `paquete_contenido`, que sí existe, y la migración
 * moría con «relation already exists».
 *
 * Cuál de las dos hay decide qué hacer: si el nombre nuevo ya está, lo que sobra
 * es el cascarón que acaba de crearse; si no, es la primera vez y toca renombrar.
 * En ninguno de los dos casos se toca un renglón de datos: lo real siempre vive
 * en `paquete_contenido`.
 */
DO $$
BEGIN
  IF to_regclass('public.paquete_contenido') IS NOT NULL THEN
    DROP TABLE IF EXISTS paquete_oficios;
  ELSE
    ALTER TABLE paquete_oficios RENAME TO paquete_contenido;
  END IF;
END $$;

ALTER TABLE paquete_contenido ALTER COLUMN oficio_id DROP NOT NULL;
ALTER TABLE paquete_contenido ADD COLUMN IF NOT EXISTS descripcion VARCHAR(300);

-- Uno u otro, nunca ambos ni ninguno. Sin esto se podrían guardar renglones
-- vacíos, que en una lista de contenido son peor que no tener el renglón.
ALTER TABLE paquete_contenido DROP CONSTRAINT IF EXISTS chk_contenido_uno_u_otro;
ALTER TABLE paquete_contenido ADD CONSTRAINT chk_contenido_uno_u_otro
  CHECK (num_nonnulls(oficio_id, NULLIF(TRIM(descripcion), '')) = 1);

COMMENT ON TABLE paquete_contenido IS
  'Qué va dentro de un paquete: oficios de PRISMA, o cosas descritas a mano que nunca entraron al sistema.';

-- El disparador seguía apuntando al nombre viejo y ahora tiene que ignorar los
-- renglones libres: la regla de «un oficio en un solo paquete vivo» no aplica a
-- algo que no es un oficio.
CREATE OR REPLACE FUNCTION paquete_oficio_no_duplicado() RETURNS trigger AS $$
DECLARE
  otro TEXT;
BEGIN
  IF NEW.oficio_id IS NULL THEN
    RETURN NEW;              -- contenido libre: no hay nada que pueda duplicarse
  END IF;

  SELECT p.folio INTO otro
    FROM paquete_contenido pc
    JOIN paquetes p ON p.id = pc.paquete_id
   WHERE pc.oficio_id  = NEW.oficio_id
     AND pc.paquete_id <> NEW.paquete_id
     AND p.estado IN ('ABIERTO','EN_TRANSITO')
   LIMIT 1;

  IF otro IS NOT NULL THEN
    RAISE EXCEPTION 'Ese oficio ya viaja en el paquete %', otro
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_paquete_oficio_no_duplicado ON paquete_contenido;
CREATE TRIGGER trg_paquete_oficio_no_duplicado
  BEFORE INSERT ON paquete_contenido
  FOR EACH ROW EXECUTE FUNCTION paquete_oficio_no_duplicado();
