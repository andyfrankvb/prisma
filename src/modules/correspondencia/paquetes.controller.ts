/**
 * Controller: Control de Correspondencia — los paquetes y su recorrido.
 * File: src/modules/correspondencia/paquetes.controller.ts
 *
 * Rastrea el PAPEL, no el expediente. Al Registro llegan oficios con documentos
 * originales que hay que llevar hasta su destinatario y muchas veces devolver a
 * quien los mandó; PRISMA sabía todo del trámite digital y nada de dónde estaba el
 * sobre.
 *
 * ── Lo que hay que entender antes de tocar esto ──────────────────────────────
 *
 * Hay dos grupos de rutas y se comportan distinto a propósito:
 *
 *   · Las de gestión piden sesión. Armar, cerrar, cancelar, consultar.
 *   · Las de rastreo NO piden sesión. Son las que abre el QR desde la cámara del
 *     teléfono. Exigir sesión ahí significaría teclear la contraseña casi a diario
 *     —duran 8 horas— y eso es exactamente lo que haría que la gente dejara de
 *     registrar. El enemigo real de una bitácora no es el registro falso, es el
 *     paso que nadie anotó.
 *
 * Lo que protege las rutas públicas es el `token`: una clave aleatoria que solo
 * viaja en el QR. Para escribir en el recorrido de un paquete hay que tener su
 * código enfrente, que es tener el paquete en la mano. El folio, que es legible y
 * secuencial, NUNCA sirve para escribir: se adivinaría probando números.
 *
 * ── Qué es constancia y qué no ───────────────────────────────────────────────
 *
 * Los pasos intermedios son bitácora: sirven para saber por dónde anduvo y a quién
 * preguntarle si algo se pierde. La identidad ahí es declarada, no probada.
 *
 * La ENTREGA sí es constancia: exige el código de cuatro dígitos que solo conoce el
 * destinatario. Es el único momento que puede tener que probarse después, y ocurre
 * una vez por paquete en lugar de una por paso.
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';

// ─── Ayudas ──────────────────────────────────────────────────────────────────

const ESTADOS_VIVOS = ['ABIERTO', 'EN_TRANSITO'];

/**
 * ¿Puede esta persona buscar CUALQUIER oficio para meterlo en un paquete?
 *
 * La visibilidad del módulo de oficios responde «¿te toca trabajar este
 * expediente?». Armar un paquete es otra pregunta: «¿qué papel tengo enfrente
 * para mandar?». Quien recibe en ventanilla tiene el sobre en la mano y necesita
 * encontrarlo, aunque el trámite no le corresponda.
 *
 * El caso que lo destapó: Fabián arma los paquetes de la Dirección General y su
 * rol es PARTICULAR, que en la visibilidad de oficios cae en «Rol no autorizado».
 * Podía crear paquetes vacíos y nada más.
 *
 * Alcanza a la Dirección General —su titular, su secretaría, sus particulares— y
 * a quien ya ve oficios de todas formas. Lo que devuelve el buscador es solo lo
 * impreso en la carátula que esa persona ya tiene enfrente: folio, remitente y
 * dependencia. Ni el contenido, ni los documentos, ni el estado del trámite.
 */
function puedeBuscarCualquierOficio(user: any): boolean {
  return user?.unidad_tipo === 'DIRECCION_GENERAL'
      || ['SUPERADMIN', 'SECRETARIA', 'OFICIAL', 'ENCARGADO', 'PARTICULAR', 'DIRECTOR'].includes(user?.rol);
}

/**
 * Folio del paquete: PAQ-02_09_2026-0001.
 *
 * Consecutivo diario y global, con la misma mecánica que los folios de oficio: el
 * contador se incrementa DENTRO de la transacción que guarda el paquete, así que
 * dos altas simultáneas no se llevan el mismo número y un fallo posterior lo
 * devuelve en lugar de dejar un hueco.
 *
 * Un paquete cancelado SÍ conserva su folio. No es un hueco: es un folio que se
 * usó, en un paquete que se deshizo, y queda a la vista. Borrarlo sería justo lo
 * contrario de llevar control.
 */
async function generarFolio(trx: any): Promise<string> {
  const hoy      = new Date();
  const fechaSql = hoy.toISOString().slice(0, 10);
  const dd = String(hoy.getDate()).padStart(2, '0');
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');

  const { rows } = await trx.raw(
    `INSERT INTO paquete_secuencia (fecha, ultimo) VALUES (?, 1)
       ON CONFLICT (fecha) DO UPDATE SET ultimo = paquete_secuencia.ultimo + 1
     RETURNING ultimo`,
    [fechaSql],
  );

  return `PAQ-${dd}_${mm}_${hoy.getFullYear()}-${String(rows[0].ultimo).padStart(4, '0')}`;
}

/** Cuatro dígitos. Se dictan de viva voz con el paquete enfrente, así que alcanzan. */
const generarCodigo = (): string => String(Math.floor(1000 + Math.random() * 9000));

/** El paquete o un 404 con su nombre, para no repetir la comprobación diez veces. */
async function paqueteOFallar(id: number, trx: any = db) {
  const p = await trx('paquetes').where({ id }).first();
  if (!p) throw new AppError('Paquete no encontrado', 404);
  return p;
}

/**
 * Un renglón de bitácora. Todo lo que le pasa a un paquete pasa por aquí, porque de
 * esta tabla sale el recorrido completo Y quién lo trae ahora.
 */
async function registrarMovimiento(
  trx: any,
  datos: {
    paquete_id: number;
    tipo: 'CREADO' | 'CERRADO' | 'TRASLADO' | 'ENTREGADO' | 'CANCELADO';
    usuario_id?: number | null;
    nombre_declarado?: string | null;
    unidad_id?: number | null;
    nota?: string | null;
  },
): Promise<void> {
  await trx('paquete_movimientos').insert({
    paquete_id:       datos.paquete_id,
    tipo:             datos.tipo,
    usuario_id:       datos.usuario_id ?? null,
    nombre_declarado: datos.nombre_declarado ?? null,
    unidad_id:        datos.unidad_id ?? null,
    nota:             datos.nota ?? null,
  });
}

/**
 * Quién trae el paquete ahora: el último movimiento de traslado, o quien lo cerró
 * si nadie lo ha tomado todavía.
 *
 * Se calcula y no se guarda. Tenerlo también como columna en `paquetes` serían dos
 * fuentes para el mismo dato, y tarde o temprano dirían cosas distintas — es el
 * error que se corrigió esta semana en las bandejas.
 */
const SQL_CUSTODIO = `(
  SELECT COALESCE(u.nombre, m.nombre_declarado)
    FROM paquete_movimientos m
    LEFT JOIN usuarios u ON u.id = m.usuario_id
   WHERE m.paquete_id = paquetes.id
     AND m.tipo IN ('CERRADO','TRASLADO')
   ORDER BY m.id DESC
   LIMIT 1
)`;

const SQL_CUSTODIO_ID = `(
  SELECT m.usuario_id
    FROM paquete_movimientos m
   WHERE m.paquete_id = paquetes.id
     AND m.tipo IN ('CERRADO','TRASLADO')
   ORDER BY m.id DESC
   LIMIT 1
)`;

const SQL_CUANTOS_OFICIOS = `(
  SELECT count(*) FROM paquete_contenido pc WHERE pc.paquete_id = paquetes.id
)::int`;

/** Las columnas que toda lista de paquetes devuelve, para que no se separen. */
const columnasPaquete = () => [
  'paquetes.id', 'paquetes.folio', 'paquetes.estado', 'paquetes.creado_en',
  'paquetes.cerrado_en', 'paquetes.entregado_en', 'paquetes.observaciones',
  'dest.nombre as destinatario_nombre',
  'dest.id as destinatario_id',
  'du.nombre as destinatario_unidad',
  'creador.nombre as creado_por_nombre',
  'orig.nombre as unidad_origen_nombre',
  db.raw(`${SQL_CUSTODIO} AS custodio_nombre`),
  db.raw(`${SQL_CUSTODIO_ID} AS custodio_id`),
  db.raw(`${SQL_CUANTOS_OFICIOS} AS cuantos_oficios`),
];

const conJoins = (q: any) => q
  .leftJoin('usuarios as dest',    'dest.id',    'paquetes.destinatario_id')
  .leftJoin('catalogo_unidades as du',   'du.id',   'dest.unidad_id')
  .leftJoin('usuarios as creador', 'creador.id', 'paquetes.creado_por_id')
  .leftJoin('catalogo_unidades as orig', 'orig.id', 'paquetes.unidad_origen_id');

// ═════════════════════════ RUTAS CON SESIÓN ══════════════════════════════════

/**
 * GET /paquetes?vista=armando|traigo|para_mi|todos
 *
 * Cuatro preguntas distintas sobre la misma tabla:
 *   · armando  — los que yo armé y todavía no salen
 *   · traigo   — los que están bajo mi custodia ahora mismo. Es la vista que
 *                convierte esto en control y no en historial.
 *   · para_mi  — los que vienen hacia mí, con su código a la vista
 *   · todos    — el histórico completo
 */
export async function listarPaquetes(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user  = req.user!;
    const vista = String(req.query.vista ?? 'todos');

    let q = conJoins(db('paquetes')).select(columnasPaquete());

    switch (vista) {
      case 'armando':
        q = q.where('paquetes.creado_por_id', user.id).andWhere('paquetes.estado', 'ABIERTO');
        break;

      case 'traigo':
        q = q.where('paquetes.estado', 'EN_TRANSITO')
             .andWhereRaw(`${SQL_CUSTODIO_ID} = ?`, [user.id]);
        break;

      case 'para_mi':
        // Solo lo que viene en camino: un paquete ya entregado no se está esperando.
        q = q.where('paquetes.destinatario_id', user.id)
             .andWhere('paquetes.estado', 'EN_TRANSITO')
             // El código va aquí y en ninguna otra vista: es de quien recibe.
             .select('paquetes.codigo_recepcion');
        break;

      default:
        break;
    }

    const data = await q.orderBy('paquetes.id', 'desc').limit(200);
    res.json({ data });
  } catch (err) { next(err); }
}

/** GET /paquetes/:id — el detalle, con lo que lleva dentro y su recorrido. */
export async function obtenerPaquete(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);

    const paquete = await conJoins(db('paquetes'))
      .where('paquetes.id', id)
      .select([...columnasPaquete(), 'paquetes.token', 'paquetes.motivo_cancelacion'])
      .first();
    if (!paquete) throw new AppError('Paquete no encontrado', 404);

    // El código solo lo ve su destinatario. Cualquier otro que abra el detalle no
    // tiene por qué poder confirmar una entrega que no le corresponde.
    if (paquete.destinatario_id === req.user!.id) {
      const fila = await db('paquetes').where({ id }).select('codigo_recepcion').first();
      paquete.codigo_recepcion = fila?.codigo_recepcion ?? null;
    }

    // Trae TODO lo que va dentro: los oficios del sistema y lo descrito a mano.
    // `leftJoin`, no `join`: con un join interno los renglones libres —que no
    // tienen `oficio_id`— desaparecerían de la lista sin que nadie lo note.
    const oficios = await db('paquete_contenido as pc')
      .leftJoin('oficios as o', 'o.id', 'pc.oficio_id')
      .where('pc.paquete_id', id)
      .select('pc.id as contenido_id', 'pc.descripcion',
              'o.id', 'o.folio', 'o.remitente', 'o.dependencia_origen',
              'o.numero_oficio_origen', 'o.estatus')
      .orderBy('pc.id', 'asc');

    const recorrido = await db('paquete_movimientos as m')
      .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'm.unidad_id')
      .where('m.paquete_id', id)
      .select('m.id', 'm.tipo', 'm.nota', 'm.registrado_en',
              db.raw('COALESCE(u.nombre, m.nombre_declarado) AS quien'),
              db.raw('(m.usuario_id IS NULL) AS declarado'),
              'cu.nombre as unidad')
      .orderBy('m.id', 'asc');

    res.json({ data: { ...paquete, oficios, recorrido } });
  } catch (err) { next(err); }
}

/** POST /paquetes — armar uno nuevo. Cualquiera puede. */
export async function crearPaquete(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const { destinatario_id, observaciones } = req.body ?? {};

    if (!destinatario_id) throw new AppError('Elige a quién va dirigido el paquete', 422);
    if (Number(destinatario_id) === user.id) {
      throw new AppError('No puedes armar un paquete dirigido a ti mismo', 422);
    }

    const dest = await db('usuarios').where({ id: destinatario_id, activo: true }).first();
    if (!dest) throw new AppError('El destinatario no existe o está inactivo', 422);

    const paquete = await db.transaction(async (trx) => {
      const folio = await generarFolio(trx);
      const [fila] = await trx('paquetes')
        .insert({
          folio,
          destinatario_id:  Number(destinatario_id),
          creado_por_id:    user.id,
          unidad_origen_id: user.oficina_id ?? null,
          observaciones:    observaciones?.trim() || null,
        })
        .returning(['id', 'folio', 'token', 'estado']);

      await registrarMovimiento(trx, {
        paquete_id: fila.id, tipo: 'CREADO',
        usuario_id: user.id, unidad_id: user.oficina_id ?? null,
      });

      return fila;
    });

    res.status(201).json({ data: paquete, message: `Paquete ${paquete.folio} creado` });
  } catch (err) { next(err); }
}

/** POST /paquetes/:id/oficios — meterle un oficio. Solo mientras esté abierto. */
export async function agregarOficio(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user      = req.user!;
    const paqueteId = parseInt(req.params.id, 10);
    const oficioId    = req.body?.oficio_id ? Number(req.body.oficio_id) : null;
    const descripcion = String(req.body?.descripcion ?? '').trim();

    // Uno u otro. En el mismo sobre viajan oficios del sistema y cosas que nunca
    // entraron a él —un acuse, un plano, una USB—, y dejarlas fuera del registro
    // solo porque no tienen folio sería perder de vista justo lo que se está
    // moviendo.
    if (!oficioId && !descripcion) {
      throw new AppError('Elige un oficio o describe qué va dentro', 422);
    }
    if (oficioId && descripcion) {
      throw new AppError('Cada renglón es un oficio o una descripción, no las dos', 422);
    }

    const paquete = await paqueteOFallar(paqueteId);
    if (paquete.estado !== 'ABIERTO') {
      throw new AppError('El paquete ya salió: no se le puede agregar contenido', 409);
    }

    let etiqueta = descripcion;
    if (oficioId) {
      const oficio = await db('oficios').where({ id: oficioId }).select('folio').first();
      if (!oficio) throw new AppError('Oficio no encontrado', 404);
      etiqueta = oficio.folio;
    }

    try {
      await db('paquete_contenido').insert({
        paquete_id: paqueteId,
        oficio_id:  oficioId,
        descripcion: oficioId ? null : descripcion,
        agregado_por_id: user.id,
      });
    } catch (e: any) {
      /**
       * El disparador de la base impide que un oficio viaje en dos paquetes vivos,
       * y su mensaje ya nombra el otro paquete — que es justo lo que la persona
       * necesita saber.
       *
       * Pero Knex le antepone la consulta completa con sus `$1, $2, $3`, y eso no
       * se le enseña a nadie. Se conserva solo lo que viene después del último
       * « - », que es el texto que escribió el disparador.
       */
      if (e?.code === '23505') {
        const bruto = String(e.message ?? '');
        const limpio = bruto.includes(' - ') ? bruto.slice(bruto.lastIndexOf(' - ') + 3) : bruto;
        throw new AppError(limpio || 'Ese oficio ya viaja en otro paquete', 409);
      }
      throw e;
    }

    res.json({ message: `«${etiqueta}» agregado al paquete` });
  } catch (err) { next(err); }
}

/** DELETE /paquetes/:id/oficios/:oficioId — sacarlo, mientras no haya salido. */
export async function quitarOficio(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const paqueteId = parseInt(req.params.id, 10);
    // Se quita por el id del RENGLÓN y no por el del oficio: el contenido descrito
    // a mano no tiene oficio, y con la clave vieja no habría forma de retirarlo.
    const contenidoId = parseInt(req.params.contenidoId, 10);

    const paquete = await paqueteOFallar(paqueteId);
    if (paquete.estado !== 'ABIERTO') {
      throw new AppError('El paquete ya salió: no se le puede quitar contenido', 409);
    }

    const borrados = await db('paquete_contenido')
      .where({ paquete_id: paqueteId, id: contenidoId }).delete();
    if (!borrados) throw new AppError('Ese renglón no está en el paquete', 404);

    res.json({ message: 'Retirado del paquete' });
  } catch (err) { next(err); }
}

/**
 * PATCH /paquetes/:id/cerrar — sale del edificio.
 *
 * Aquí se genera el código de recepción, y no al crear: mientras el paquete está
 * abierto todavía puede cancelarse, y no tiene sentido avisarle a nadie de algo que
 * quizá no salga.
 *
 * Quien cierra queda como primer custodio: alguien tiene el sobre en la mano desde
 * el momento en que sale, y si no se registrara, el primer tramo del recorrido
 * —justo el que va de la ventanilla al carro— quedaría en blanco.
 */
export async function cerrarPaquete(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user      = req.user!;
    const paqueteId = parseInt(req.params.id, 10);

    const resultado = await db.transaction(async (trx) => {
      const paquete = await paqueteOFallar(paqueteId, trx);
      if (paquete.estado !== 'ABIERTO') {
        throw new AppError(`El paquete ya no está abierto (${paquete.estado})`, 409);
      }

      const cuantos = await trx('paquete_contenido')
        .where({ paquete_id: paqueteId }).count('* as n').first();
      if (Number(cuantos?.n ?? 0) === 0) {
        throw new AppError('El paquete está vacío: agrégale al menos un oficio antes de cerrarlo', 422);
      }

      const codigo = generarCodigo();
      await trx('paquetes').where({ id: paqueteId }).update({
        estado: 'EN_TRANSITO', codigo_recepcion: codigo, cerrado_en: trx.fn.now(),
      });

      await registrarMovimiento(trx, {
        paquete_id: paqueteId, tipo: 'CERRADO',
        usuario_id: user.id, unidad_id: user.oficina_id ?? null,
      });

      return { folio: paquete.folio, token: paquete.token, codigo };
    });

    /**
     * La dirección que va DENTRO del QR la decide el servidor, no el navegador.
     *
     * Antes se armaba con `window.location.origin`, o sea la URL que quien cierra
     * el paquete tenía escrita en su barra. Trabajando en local eso es
     * `http://localhost`, y un QR con localhost apunta al PROPIO teléfono de quien
     * lo escanea: no lleva a ningún lado. El papel se imprime y sale a la calle con
     * una dirección inservible, y nadie se entera hasta que alguien lo escanea.
     *
     * `APP_URL` es la dirección pública del sistema. Si no está configurada se usa
     * la del propio pedido —el `Host` que nginx reenvía—, que es al menos la que la
     * persona alcanzó, no una suposición.
     */
    const base = process.env.APP_URL?.replace(/\/+$/, '')
              ?? `${req.protocol}://${req.get('host')}`;

    res.json({
      data: { ...resultado, url_qr: `${base}/p/${resultado.token}` },
      message: `Paquete ${resultado.folio} listo para salir. Imprime su código.`,
    });
  } catch (err) { next(err); }
}

/**
 * PATCH /paquetes/:id/cancelar — solo antes de salir.
 *
 * Un paquete que ya salió NO se cancela: el papel está afuera, y borrarlo del
 * sistema sería lo contrario de llevar control. Si algo salió mal en el camino, lo
 * que corresponde es que quien lo tenga registre dónde quedó.
 */
export async function cancelarPaquete(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user      = req.user!;
    const paqueteId = parseInt(req.params.id, 10);
    const motivo    = String(req.body?.motivo ?? '').trim();

    await db.transaction(async (trx) => {
      const paquete = await paqueteOFallar(paqueteId, trx);
      if (paquete.estado !== 'ABIERTO') {
        throw new AppError(
          'Solo se puede cancelar un paquete que todavía no sale. Este ya está en camino.',
          409,
        );
      }
      if (paquete.creado_por_id !== user.id) {
        throw new AppError('Solo quien armó el paquete puede cancelarlo', 403);
      }

      await trx('paquetes').where({ id: paqueteId }).update({
        estado: 'CANCELADO', cancelado_en: trx.fn.now(), motivo_cancelacion: motivo || null,
      });

      await registrarMovimiento(trx, {
        paquete_id: paqueteId, tipo: 'CANCELADO',
        usuario_id: user.id, unidad_id: user.oficina_id ?? null, nota: motivo || null,
      });
    });

    res.json({ message: 'Paquete cancelado. Sus oficios quedaron libres.' });
  } catch (err) { next(err); }
}

/**
 * GET /paquetes/destinatarios — a quién se le puede mandar un paquete.
 *
 * Todos los activos menos uno mismo. No se acota por área a propósito: la gracia
 * del módulo es justamente mover papel entre oficinas distintas.
 */
export async function listarDestinatarios(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .where('u.activo', true)
      .andWhereNot('u.id', req.user!.id)
      .select('u.id', 'u.nombre', 'cu.nombre as unidad')
      .orderBy('u.nombre', 'asc');
    res.json({ data });
  } catch (err) { next(err); }
}

// ═════════════════════ RUTAS PÚBLICAS — las del QR ═══════════════════════════
//
// Sin sesión, a propósito. Ver la explicación de arriba. Se identifican con el
// `token`, nunca con el folio.

/** GET /publico/:token — lo que ve quien acaba de escanear. */
export async function rastrearPorToken(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const token = String(req.params.token ?? '');

    const paquete = await conJoins(db('paquetes'))
      .where('paquetes.token', token)
      .select(columnasPaquete())
      .first();
    // Mismo mensaje para un token inválido que para uno inexistente: no hay por qué
    // decirle a quien anda probando si acertó a la mitad.
    if (!paquete) throw new AppError('Ese código no corresponde a ningún paquete', 404);

    const oficios = await db('paquete_contenido as pc')
      .leftJoin('oficios as o', 'o.id', 'pc.oficio_id')
      .where('pc.paquete_id', paquete.id)
      .select('pc.descripcion', 'o.folio', 'o.remitente', 'o.dependencia_origen')
      .orderBy('pc.id', 'asc');

    const recorrido = await db('paquete_movimientos as m')
      .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
      .where('m.paquete_id', paquete.id)
      .select('m.tipo', 'm.registrado_en',
              db.raw('COALESCE(u.nombre, m.nombre_declarado) AS quien'))
      .orderBy('m.id', 'asc');

    // El código de recepción NO viaja aquí. Esta ruta la abre cualquiera que tenga
    // el QR —incluido quien lo transporta—, y el código es lo único que distingue
    // al destinatario de quien nada más lo trae.
    res.json({ data: { ...paquete, oficios, recorrido } });
  } catch (err) { next(err); }
}

/**
 * GET /publico/personas — la lista para identificarse la primera vez.
 *
 * Solo nombre y área: lo justo para reconocerse en una lista. Sin correos ni roles,
 * porque esta ruta no pide sesión y no hay por qué publicar el directorio.
 */
export async function personasParaEscaneo(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .where('u.activo', true)
      .select('u.id', 'u.nombre', 'cu.nombre as unidad')
      .orderBy('u.nombre', 'asc');
    res.json({ data });
  } catch (err) { next(err); }
}

/**
 * POST /publico/:token/traslado — «lo traigo yo».
 *
 * Un toque, sin credencial. La identidad es declarada: se elige de la lista, o se
 * escribe si quien lo lleva no es del sistema —un mensajero externo, que es
 * justamente el caso que justifica no exigir cuenta—.
 *
 * No se valida quién puede: si escanea quien no debía, queda registrado igual. La
 * bitácora sirve para SABER dónde estuvo, no para impedir que se mueva.
 */
export async function registrarTraslado(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const token = String(req.params.token ?? '');
    const usuarioId = req.body?.usuario_id ? Number(req.body.usuario_id) : null;
    const nombre    = String(req.body?.nombre_declarado ?? '').trim();

    if (!usuarioId && !nombre) {
      throw new AppError('Dinos quién lo trae', 422);
    }

    const paquete = await db('paquetes').where({ token }).first();
    if (!paquete) throw new AppError('Ese código no corresponde a ningún paquete', 404);

    if (paquete.estado === 'ENTREGADO') {
      throw new AppError(`Este paquete ya fue entregado. No hay nada que registrar.`, 409);
    }
    if (paquete.estado === 'CANCELADO') {
      throw new AppError('Este paquete fue cancelado y no debería estar circulando.', 409);
    }
    if (paquete.estado === 'ABIERTO') {
      throw new AppError('Este paquete todavía no se ha cerrado: no ha salido.', 409);
    }

    let unidadId: number | null = null;
    if (usuarioId) {
      const u = await db('usuarios').where({ id: usuarioId, activo: true })
        .select('unidad_id').first();
      if (!u) throw new AppError('Esa persona no está activa en el sistema', 422);
      unidadId = u.unidad_id ?? null;
    }

    await registrarMovimiento(db, {
      paquete_id: paquete.id, tipo: 'TRASLADO',
      usuario_id: usuarioId, nombre_declarado: usuarioId ? null : nombre,
      unidad_id: unidadId,
    });

    res.json({ message: `Quedó registrado que traes el paquete ${paquete.folio}` });
  } catch (err) { next(err); }
}

/**
 * POST /publico/:token/entrega — el destinatario lo recibe.
 *
 * Aquí SÍ hay verificación, y es la única del módulo: el código de cuatro dígitos
 * que solo conoce el destinatario. Es lo que convierte la entrega en constancia y
 * no en otro renglón declarado.
 */
export async function registrarEntrega(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const token  = String(req.params.token ?? '');
    const codigo = String(req.body?.codigo ?? '').trim();
    if (!codigo) throw new AppError('Pide el código al destinatario', 422);

    const resultado = await db.transaction(async (trx) => {
      const paquete = await trx('paquetes').where({ token }).forUpdate().first();
      if (!paquete) throw new AppError('Ese código no corresponde a ningún paquete', 404);

      if (paquete.estado === 'ENTREGADO') {
        throw new AppError('Este paquete ya había sido entregado', 409);
      }
      if (paquete.estado !== 'EN_TRANSITO') {
        throw new AppError(`El paquete no está en camino (${paquete.estado})`, 409);
      }
      if (paquete.codigo_recepcion !== codigo) {
        throw new AppError('El código no coincide. Pídeselo de nuevo al destinatario.', 422);
      }

      await trx('paquetes').where({ id: paquete.id }).update({
        estado: 'ENTREGADO',
        entregado_en: trx.fn.now(),
        recibido_por_id: paquete.destinatario_id,
      });

      await registrarMovimiento(trx, {
        paquete_id: paquete.id, tipo: 'ENTREGADO',
        usuario_id: paquete.destinatario_id,
      });

      return paquete;
    });

    res.json({ message: `Paquete ${resultado.folio} entregado. Gracias.` });
  } catch (err) { next(err); }
}

/**
 * GET /paquetes/buscar-oficios?q=…
 *
 * El buscador para armar un paquete, y a propósito NO es el del módulo de oficios.
 *
 * Aquel responde «¿te toca trabajar este expediente?», y con esa regla Fabián
 * —rol PARTICULAR— recibía «Rol no autorizado»: podía crear paquetes vacíos y
 * nada más. Pero él es justamente quien recibe el sobre en ventanilla y quien
 * tiene que encontrarlo para mandarlo.
 *
 * Devuelve solo lo impreso en la carátula que quien busca ya tiene enfrente:
 * folio, número de origen, remitente y dependencia. Ni el asunto, ni los
 * documentos, ni en qué va el trámite.
 *
 * Se excluye lo que ya viaja en un paquete vivo: el papel es uno solo, y
 * ofrecerlo otra vez solo llevaría al error que el disparador rechaza después.
 */
export async function buscarOficiosParaPaquete(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) { res.json({ data: [] }); return; }

    let query = db('oficios as o')
      .leftJoin('usuarios as dir', 'dir.id', 'o.dirigido_a_id')
      .whereNotExists(function () {
        this.select('*').from('paquete_contenido as pc')
          .join('paquetes as p', 'p.id', 'pc.paquete_id')
          .whereRaw('pc.oficio_id = o.id')
          .whereIn('p.estado', ESTADOS_VIVOS);
      })
      .andWhere((sub: any) => {
        sub.whereILike('o.folio', `%${q}%`)
           .orWhereILike('o.remitente', `%${q}%`)
           .orWhereILike('o.dependencia_origen', `%${q}%`)
           .orWhereILike('o.numero_oficio_origen', `%${q}%`);
      })
      // Lo justo para cotejar contra el papel que se tiene en la mano: son los
      // mismos datos impresos en la carátula. Sin el asunto completo, sin los
      // documentos y sin en qué va el trámite.
      .select('o.id', 'o.folio', 'o.numero_oficio_origen', 'o.remitente',
              'o.dependencia_origen', 'o.fecha_oficio', 'o.descripcion_solicitud',
              // Los pide el historial, que es el mismo componente del detalle del
              // oficio: sin ellos habría que inventar un objeto a medias.
              'o.estatus', 'o.fecha_registro',
              'dir.nombre as dirigido_a_nombre')
      .orderBy('o.id', 'desc')
      .limit(25);

    // Quien no alcanza a ver todos solo encuentra los de su propia área. Es una
    // cota conservadora: si mañana alguien más arma paquetes, verá lo suyo en vez
    // de no ver nada.
    if (!puedeBuscarCualquierOficio(user) && user.oficina_id) {
      query = query.andWhere('dir.unidad_id', user.oficina_id);
    }

    res.json({ data: await query });
  } catch (err) { next(err); }
}
