/**
 * Controller: Delegatorios
 * File: src/modules/oficialia_partes/delegatorios.controller.ts
 *
 * La Dirección General turna parte de un oficio a otra área (delegación o
 * dirección) sin soltar el oficio. Un oficio puede tener varios delegatorios
 * abiertos a la vez, uno por área.
 *
 * Recorrido de cada delegatorio:
 *   PENDIENTE   → el encargado del área destino lo recibe y lo asigna
 *   ASIGNADO    → alguien de esa área sube documento + justificación
 *   EN_REVISION → su encargado revisa (puede devolverlo a corregir)
 *   CONTESTADO  → regresa a quien lo detonó (que también puede devolverlo)
 *
 * Mientras haya delegatorios sin contestar, el oficio no se puede firmar.
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import { storage }  from '../../services/storage.service';
import { notifyDelegatorio } from '../../notifications/notification.dispatcher';
import { destinosPermitidos, puedeEnviarA, unidadDelOficio } from './destinos';
import { logger }   from '../../utils/logger';

/** La zona del estado. La base corre en UTC, así que hay que decirlo siempre. */
const ZONA = process.env.TZ ?? 'America/Cancun';

/**
 * Días hábiles entre dos instantes, contados por la base.
 *
 * El cálculo tiene que hacerse aquí y no en JavaScript: ya nos pasó que el
 * contador de horas salía con cinco de diferencia porque se restaba en el
 * servidor contra una fecha sin zona horaria. Las dos marcas se llevan a la zona
 * del estado antes de recortarlas a día, para que el corte de la medianoche sea
 * el de aquí y no el de Greenwich.
 *
 * Cuenta igual que `diasHabilesEntre`: el día de partida no suma, así que una
 * solicitud hecha hoy muestra 0 y mañana muestra 1. Sábados y domingos no
 * cuentan; los días festivos todavía no, porque falta ese catálogo.
 */
const DIAS_HABILES = (desde: string, hasta: string) => `(
  SELECT count(*)::int
    FROM generate_series(
           ((${desde}) AT TIME ZONE '${ZONA}')::date + 1,
           ((${hasta}) AT TIME ZONE '${ZONA}')::date,
           interval '1 day') AS d
   WHERE extract(isodow FROM d) < 6)`;

/** Estados por los que pasa un delegatorio. */
type EstadoDelegatorio =
  | 'PENDIENTE' | 'ASIGNADO' | 'EN_REVISION' | 'CONTESTADO'
  /** El área destino lo regresó por no ser de su competencia. */
  | 'RECHAZADO'
  /** Quien la pidió la cerró: ya no la necesita, o le pidió a la que no era. */
  | 'CANCELADO';

/**
 * Estados de los que se puede volver a pedir a la misma área. Son los dos
 * finales que no dejaron respuesta: uno porque el área dijo que no le tocaba,
 * el otro porque quien pidió se arrepintió. En ambos casos el intento pudo ser
 * un error y volver a pedir es legítimo.
 */
const REINTENTABLES: EstadoDelegatorio[] = ['RECHAZADO', 'CANCELADO'];

/** Un delegatorio deja de bloquear cuando queda CONTESTADO. */
const ABIERTOS: EstadoDelegatorio[] = ['PENDIENTE', 'ASIGNADO', 'EN_REVISION'];

/** ¿El oficio tiene delegatorios sin contestar? Bloquea VoBo y firma. */
export async function tieneDelegatoriosPendientes(oficioId: number): Promise<boolean> {
  const [row] = await db('oficio_delegatorios')
    .where('oficio_id', oficioId)
    .whereIn('estado', ABIERTOS)
    .count('id as n');
  return Number((row as any)?.n ?? 0) > 0;
}

/** Unidades de las que el usuario es ENCARGADO configurado. */
async function unidadesDelEncargado(userId: number): Promise<number[]> {
  return db('configuracion_flujos')
    .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'ENCARGADO', usuario_id: userId })
    .whereNotNull('unidad_id')
    .pluck('unidad_id');
}

/**
 * ¿Puede este usuario solicitar información a otra área sobre este oficio?
 *
 * Antes solo se podía desde la Dirección General. Eso obligaba a que cualquier
 * área que necesitara algo de otra lo pidiera por fuera del sistema —de palabra
 * o por correo— y volviera a subirlo a mano, que es el trámite que se quiere
 * quitar. Ahora lo puede hacer cualquier área sobre el oficio que tiene: quien
 * responde por ella (su titular o su encargado) o el analista que lo trabaja.
 *
 * A dónde puede dirigirse es harina de otro costal y lo decide la configuración
 * de destinos, no esta función.
 */
async function puedeDetonar(user: any, oficioId: number): Promise<boolean> {
  const oficio = await db('oficios as o')
    .leftJoin('usuarios as dir', 'dir.id', 'o.dirigido_a_id')
    .where('o.id', oficioId)
    .select('o.id', 'o.estatus', 'o.dirigido_a_id', 'dir.unidad_id as unidad_actual')
    .first();
  if (!oficio) throw new AppError('Oficio no encontrado', 404);
  // Un oficio ya firmado no admite solicitudes nuevas: no hay nada que esperar.
  if (oficio.estatus === 'FINALIZADO') return false;

  // El titular del área que lo tiene.
  if (oficio.dirigido_a_id === user.id) return true;

  // O su encargado de oficios.
  const unidades = await unidadesDelEncargado(user.id);
  if (oficio.unidad_actual && unidades.includes(oficio.unidad_actual)) return true;

  // O el analista que lo tiene asignado, siempre que siga siendo del área donde
  // vive el oficio: una asignación vieja no debe dar permisos en la nueva área.
  const asignacion = await db('asignaciones_juridicas as a')
    .leftJoin('usuarios as u', 'u.id', 'a.abogado_id')
    .where('a.oficio_id', oficioId)
    .orderBy('a.id', 'desc')
    .select('a.abogado_id', 'u.unidad_id')
    .first();
  return asignacion?.abogado_id === user.id
      && asignacion?.unidad_id === oficio.unidad_actual;
}

async function getDelegatorioOrFail(id: number) {
  const d = await db('oficio_delegatorios').where({ id }).first();
  if (!d) throw new AppError('Delegatorio no encontrado', 404);
  return d;
}

/** Registra un movimiento en el historial del delegatorio. */
async function registrarComentario(
  trx: any, delegatorioId: number, usuarioId: number, comentario: string, estadoPrevio: string,
) {
  await trx('delegatorio_comentarios').insert({
    delegatorio_id: delegatorioId,
    usuario_id:     usuarioId,
    comentario,
    estado_previo:  estadoPrevio,
    creado_en:      new Date(),
  });
}

/** Encargados configurados de un área. Son quienes reciben lo que llega al área. */
async function encargadosDeUnidad(unidadId: number): Promise<number[]> {
  return db('configuracion_flujos')
    .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'ENCARGADO', unidad_id: unidadId })
    .whereNotNull('usuario_id')
    .pluck('usuario_id');
}

/** Folio, dependencia y nombre del área: lo que las notificaciones necesitan mostrar. */
async function contextoDelegatorio(oficioId: number, unidadId: number) {
  const [oficio, unidad] = await Promise.all([
    db('oficios').where({ id: oficioId }).select('folio', 'dependencia_origen').first(),
    db('catalogo_unidades').where({ id: unidadId }).select('nombre').first(),
  ]);
  return {
    folio:              oficio?.folio ?? '',
    dependencia_origen: oficio?.dependencia_origen ?? undefined,
    area:               unidad?.nombre ?? undefined,
  };
}

/**
 * Avisa sin frenar la operación: si el correo o el push fallan, el delegatorio
 * ya quedó guardado y no tiene por qué revertirse.
 */
function avisar(p: Parameters<typeof notifyDelegatorio>[0]): void {
  notifyDelegatorio(p).catch((err) =>
    logger.error({ err, event: p.event, oficio_id: p.oficio_id }, 'Notificación de delegatorio falló'),
  );
}

// ── GET /oficios/:id/delegatorios ────────────────────────────
// Los delegatorios del oficio, con su estado. Alimenta la sección
// «Documentos del flujo» del expediente.
export async function listarDelegatorios(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const oficioId = parseInt(req.params.id, 10);
    const user     = req.user!;

    /**
     * Quién ve qué.
     *
     * El área que pidió ve todas las solicitudes del oficio: necesita el
     * panorama para saber si ya puede cerrar el trámite. Las áreas a las que se
     * les pidió ven **solo la suya** —lo que hagan las demás no es asunto suyo, y
     * enseñárselo dejaba a una delegación mirando el avance de las otras tres—.
     *
     * Se filtra aquí y no en la pantalla: lo que no debe verse tampoco tiene por
     * qué salir del servidor.
     */
    const esDeQuienPidio = await puedeDetonar(user, oficioId);
    const misUnidades    = esDeQuienPidio ? [] : await unidadesDelEncargado(user.id);

    const filas = await db('oficio_delegatorios as d')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'd.unidad_destino_id')
      .leftJoin('usuarios as sol', 'sol.id', 'd.solicitado_por_id')
      .leftJoin('usuarios as asig', 'asig.id', 'd.asignado_a_id')
      .leftJoin('usuarios as resp', 'resp.id', 'd.respondido_por_id')
      .where('d.oficio_id', oficioId)
      .modify((q: any) => {
        if (esDeQuienPidio) return;
        // Lo suyo: lo dirigido a su área, o lo que le tocó trabajar a ella misma.
        q.where((sub: any) => {
          if (misUnidades.length) sub.whereIn('d.unidad_destino_id', misUnidades);
          else                    sub.whereRaw('1 = 0');
          sub.orWhere('d.asignado_a_id', user.id);
        });
      })
      .select(
        'd.id', 'd.estado', 'd.descripcion', 'd.documento_url', 'd.observacion',
        'd.creado_en', 'd.respondido_en', 'd.unidad_destino_id', 'd.fecha_vencimiento',
        'cu.nombre as area',
        'sol.nombre as solicitado_por',
        'asig.nombre as asignado_a',
        'resp.nombre as respondido_por',
        // El reloj se detiene cuando el área contestó; de ahí en adelante el
        // número deja de crecer y queda como el registro de lo que tardó.
        db.raw(`${DIAS_HABILES('d.creado_en', 'COALESCE(d.respondido_en, now())')} AS dias_transcurridos`),
        // Solo lo que trae plazo —hoy, los testamentos— cuenta hacia atrás. El
        // resto lleva un contador abierto y estas dos columnas van nulas.
        db.raw(`CASE WHEN d.fecha_vencimiento IS NULL THEN NULL ELSE
                  ${DIAS_HABILES('COALESCE(d.respondido_en, now())',
                                 "d.fecha_vencimiento::timestamp AT TIME ZONE '" + ZONA + "'")}
                END AS dias_restantes`),
        db.raw(`CASE WHEN d.fecha_vencimiento IS NULL THEN false ELSE
                  (COALESCE(d.respondido_en, now()) AT TIME ZONE '${ZONA}')::date > d.fecha_vencimiento
                END AS vencido`),
      )
      .orderBy('cu.nombre', 'asc');

    res.json({
      data: filas,
      meta: { pendientes: filas.filter((f: any) => ABIERTOS.includes(f.estado)).length },
    });
  } catch (err) { next(err); }
}

// ── POST /oficios/:id/delegatorios ───────────────────────────
// Detona el delegatorio hacia una o varias áreas.
export async function crearDelegatorios(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user     = req.user!;
    const oficioId = parseInt(req.params.id, 10);

    if (!(await puedeDetonar(user, oficioId))) {
      throw new AppError('Solo el titular del área, su encargado o el analista asignado pueden solicitar información sobre este oficio', 403);
    }

    const descripcion = String(req.body?.descripcion ?? '').trim().toUpperCase();
    // Si el oficio es de testamentos, los delegatorios a delegaciones heredan
    // el plazo ya fijado al marcarlo. No hay nada que capturar.
    const datosOficio = await db('oficios').where({ id: oficioId })
      .select('testamento', 'testamento_vence_delegaciones').first();
    const venceTestamento = datosOficio?.testamento
      ? datosOficio.testamento_vence_delegaciones ?? null
      : null;
    const unidades: number[] = Array.isArray(req.body?.unidades)
      ? req.body.unidades.map(Number).filter(Boolean)
      : [];

    if (!descripcion)     throw new AppError('Describe qué información se solicita', 422);
    if (!unidades.length) throw new AppError('Selecciona al menos un área destino', 422);

    // Se revalida contra la configuración, no solo al pintar la lista: entre que
    // alguien abre el panel y lo envía, los destinos pudieron cambiar, y nada
    // impide llamar a la API sin haber pasado por la pantalla.
    const origen = await unidadDelOficio(oficioId);
    if (!origen) throw new AppError('El oficio no está en ningún área', 422);
    const permisos = await Promise.all(unidades.map((u) => puedeEnviarA(origen, u)));
    const validas  = unidades.filter((_u, i) => permisos[i]);
    if (validas.length !== unidades.length) {
      throw new AppError('Tu área no puede dirigirse a alguna de las áreas seleccionadas', 422);
    }

    // Áreas a las que ya se pidió sobre este oficio: no se duplican. Las que lo
    // rechazaron, y aquellas cuya solicitud se canceló, sí se pueden volver a
    // intentar, por si el cierre anterior fue un error.
    const yaSolicitadas = await db('oficio_delegatorios')
      .where('oficio_id', oficioId)
      .whereIn('unidad_destino_id', validas)
      .whereNotIn('estado', REINTENTABLES)
      .pluck('unidad_destino_id');
    const reintentables = await db('oficio_delegatorios')
      .where('oficio_id', oficioId)
      .whereIn('unidad_destino_id', validas)
      .whereIn('estado', REINTENTABLES)
      .pluck('unidad_destino_id');
    const nuevas = validas.filter((u: number) => !yaSolicitadas.includes(u));
    if (!nuevas.length) {
      throw new AppError('Ya se solicitó información a las áreas seleccionadas', 409);
    }

    // Solo las delegaciones llevan el plazo del testamento.
    const tiposDestino = new Map<number, string>(
      (await db('catalogo_unidades').whereIn('id', nuevas).select('id', 'tipo'))
        .map((u: any) => [u.id, u.tipo]),
    );
    const plazoDe = (unidadId: number) =>
      (venceTestamento && tiposDestino.get(unidadId) === 'DELEGACION') ? venceTestamento : null;

    await db.transaction(async (trx) => {
      for (const unidadId of nuevas) {
        // Reintento sobre un cierre previo —rechazo o cancelación—: se reabre el
        // mismo registro. Se limpian también las marcas de aviso y el reloj de
        // respuesta, porque el conteo de días arranca de nuevo con esta petición.
        if (reintentables.includes(unidadId)) {
          const previo = await trx('oficio_delegatorios')
            .where({ oficio_id: oficioId, unidad_destino_id: unidadId })
            .select('estado').first();
          const [fila] = await trx('oficio_delegatorios')
            .where({ oficio_id: oficioId, unidad_destino_id: unidadId })
            .update({
              descripcion, estado: 'PENDIENTE', solicitado_por_id: user.id,
              asignado_a_id: null, documento_url: null, observacion: null,
              respondido_por_id: null, respondido_en: null,
              cancelado_en: null, cancelado_por_id: null,
              aviso_sin_asignar_en: null, aviso_sin_responder_en: null,
              creado_en: new Date(), actualizado_en: new Date(),
              fecha_vencimiento: plazoDe(unidadId),
            })
            .returning('id');
          await registrarComentario(trx, Number(fila.id ?? fila), user.id,
            `Solicitud reenviada: ${descripcion}`, previo?.estado ?? 'RECHAZADO');
          continue;
        }
        const [fila] = await trx('oficio_delegatorios').insert({
          oficio_id:         oficioId,
          unidad_destino_id: unidadId,
          solicitado_por_id: user.id,
          descripcion,
          estado:            'PENDIENTE',
          fecha_vencimiento: plazoDe(unidadId),
          creado_en:         new Date(),
          actualizado_en:    new Date(),
        }).returning('id');
        // Queda en la línea de tiempo del oficio: cuándo y qué se delegó.
        await registrarComentario(trx, Number(fila.id ?? fila), user.id, `Solicitud a otra área: ${descripcion}`, 'PENDIENTE');
      }
    });

    for (const unidadId of nuevas) {
      const ctx = await contextoDelegatorio(oficioId, unidadId);
      avisar({
        event: 'DELEGATORIO_NUEVO', usuarioIds: await encargadosDeUnidad(unidadId),
        oficio_id: oficioId, nota: descripcion, ...ctx,
      });
    }

    res.status(201).json({
      message: nuevas.length === 1
        ? 'Delegatorio enviado'
        : `Delegatorio enviado a ${nuevas.length} áreas`,
      data: { creados: nuevas.length, omitidos: validas.length - nuevas.length },
    });
  } catch (err) { next(err); }
}

// ── GET /delegatorios/bandeja ────────────────────────────────
// Los delegatorios que le tocan al usuario: como encargado del área destino
// o como la persona a la que se le asignó.
export async function bandejaDelegatorios(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user     = req.user!;
    const unidades = await unidadesDelEncargado(user.id);

    const filas = await db('oficio_delegatorios as d')
      .join('oficios as o', 'o.id', 'd.oficio_id')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'd.unidad_destino_id')
      .leftJoin('usuarios as sol', 'sol.id', 'd.solicitado_por_id')
      .leftJoin('usuarios as asig', 'asig.id', 'd.asignado_a_id')
      .where((q) => {
        if (unidades.length) q.whereIn('d.unidad_destino_id', unidades);
        else q.whereRaw('1 = 0');
        q.orWhere('d.asignado_a_id', user.id);
      })
      .whereIn('d.estado', ABIERTOS)
      .select(
        'd.id', 'd.estado', 'd.descripcion', 'd.creado_en', 'd.documento_url', 'd.observacion',
        'o.id as oficio_id', 'o.folio', 'o.remitente', 'o.dependencia_origen',
        'o.descripcion_solicitud', 'o.fecha_vencimiento', 'o.tiene_termino',
        'cu.nombre as area',
        'sol.nombre as solicitado_por',
        'asig.nombre as asignado_a',
      )
      .orderBy('d.creado_en', 'asc');

    res.json({ data: filas });
  } catch (err) { next(err); }
}

// ── PATCH /delegatorios/:id/asignar ──────────────────────────
// El encargado del área destino lo turna a alguien de su propia área.
export async function asignarDelegatorio(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const d    = await getDelegatorioOrFail(id);

    const unidades = await unidadesDelEncargado(user.id);
    if (!unidades.includes(d.unidad_destino_id)) {
      throw new AppError('Solo el encargado del área destino puede asignar este delegatorio', 403);
    }
    if (!['PENDIENTE', 'ASIGNADO'].includes(d.estado)) {
      throw new AppError('Este delegatorio ya no se puede reasignar', 422);
    }

    const asignadoA = Number(req.body?.usuario_id);
    if (!asignadoA) throw new AppError('Selecciona a quién se le asigna', 422);

    // Debe ser alguien de la misma área destino.
    const destinatario = await db('usuarios')
      .where({ id: asignadoA, unidad_id: d.unidad_destino_id, activo: true })
      .first();
    if (!destinatario) throw new AppError('La persona seleccionada no pertenece al área destino', 422);

    await db.transaction(async (trx) => {
      await trx('oficio_delegatorios').where({ id }).update({
        asignado_a_id: asignadoA, estado: 'ASIGNADO', actualizado_en: new Date(),
      });
      await registrarComentario(trx, id, user.id, `Asignado a ${destinatario.nombre}`, d.estado);
    });

    avisar({
      event: 'DELEGATORIO_ASIGNADO', usuarioIds: [asignadoA], oficio_id: d.oficio_id,
      nota: d.descripcion, ...(await contextoDelegatorio(d.oficio_id, d.unidad_destino_id)),
    });

    res.json({ message: `Delegatorio asignado a ${destinatario.nombre}` });
  } catch (err) { next(err); }
}

// ── POST /delegatorios/:id/responder ─────────────────────────
// Quien fue asignado sube el documento y la justificación, y lo manda a su encargado.
export async function responderDelegatorio(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const d    = await getDelegatorioOrFail(id);

    const unidades  = await unidadesDelEncargado(user.id);
    const esAsignado = d.asignado_a_id === user.id;
    const esEncargado = unidades.includes(d.unidad_destino_id);
    if (!esAsignado && !esEncargado) {
      throw new AppError('No tienes permiso para responder este delegatorio', 403);
    }
    if (!['ASIGNADO', 'EN_REVISION'].includes(d.estado)) {
      throw new AppError('Este delegatorio no está en una etapa donde se pueda responder', 422);
    }

    const observacion = String(req.body?.observacion ?? '').trim().toUpperCase();
    // El documento es opcional: hay solicitudes que se contestan diciendo que no
    // se encontró información, y exigir un archivo obligaba a inventar uno o a
    // dejar la solicitud abierta para siempre. La justificación sí es obligatoria
    // —ahí se explica qué se buscó y qué se encontró—.
    if (!observacion) throw new AppError('Escribe la justificación de tu respuesta', 422);

    let url = d.documento_url;
    if (req.file) {
      url = await storage.save(req.file, 'oficios/delegatorios', {
        filename: `delegatorio_${id}_${Date.now()}`,
      });
    }

    await db.transaction(async (trx) => {
      await trx('oficio_delegatorios').where({ id }).update({
        documento_url:     url,
        observacion,
        respondido_por_id: user.id,
        estado:            'EN_REVISION',
        actualizado_en:    new Date(),
      });
      await registrarComentario(trx, id, user.id, 'Respuesta enviada a revisión', d.estado);
    });

    avisar({
      event: 'DELEGATORIO_EN_REVISION', usuarioIds: await encargadosDeUnidad(d.unidad_destino_id),
      oficio_id: d.oficio_id, nota: observacion,
      ...(await contextoDelegatorio(d.oficio_id, d.unidad_destino_id)),
    });

    res.json({ message: 'Respuesta enviada a tu encargado para revisión' });
  } catch (err) { next(err); }
}

// ── PATCH /delegatorios/:id/devolver ─────────────────────────
// Reconsideración. La usan dos figuras:
//   · el encargado del área destino, para que su gente corrija (EN_REVISION → ASIGNADO)
//   · quien detonó el delegatorio, para que el área corrija (CONTESTADO → EN_REVISION)
export async function devolverDelegatorio(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const d    = await getDelegatorioOrFail(id);

    const comentario = String(req.body?.comentario ?? '').trim().toUpperCase();
    if (!comentario) throw new AppError('Indica qué debe corregirse', 422);

    const unidades = await unidadesDelEncargado(user.id);
    let nuevoEstado: EstadoDelegatorio;

    if (d.estado === 'EN_REVISION' && unidades.includes(d.unidad_destino_id)) {
      // El encargado del área lo regresa a quien lo trabajó.
      nuevoEstado = d.asignado_a_id ? 'ASIGNADO' : 'PENDIENTE';
    } else if (d.estado === 'CONTESTADO' && d.solicitado_por_id === user.id) {
      // Quien lo detonó lo regresa al área destino.
      nuevoEstado = 'EN_REVISION';
    } else {
      throw new AppError('No puedes devolver este delegatorio en su etapa actual', 403);
    }

    await db.transaction(async (trx) => {
      await trx('oficio_delegatorios').where({ id }).update({
        estado: nuevoEstado, actualizado_en: new Date(),
        ...(nuevoEstado === 'EN_REVISION' ? {} : { respondido_en: null }),
      });
      await registrarComentario(trx, id, user.id, comentario, d.estado);
    });

    // Avisa a quien le toca corregir: la persona asignada, o el área destino.
    const aCorregir = nuevoEstado === 'ASIGNADO' && d.asignado_a_id
      ? [d.asignado_a_id]
      : await encargadosDeUnidad(d.unidad_destino_id);
    avisar({
      event: 'DELEGATORIO_DEVUELTO', usuarioIds: aCorregir, oficio_id: d.oficio_id,
      nota: comentario, ...(await contextoDelegatorio(d.oficio_id, d.unidad_destino_id)),
    });

    res.json({ message: 'Delegatorio devuelto para corrección' });
  } catch (err) { next(err); }
}

// ── PATCH /delegatorios/:id/aprobar ──────────────────────────
// El encargado del área destino aprueba y lo regresa a quien lo detonó.
export async function aprobarDelegatorio(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const d    = await getDelegatorioOrFail(id);

    const unidades = await unidadesDelEncargado(user.id);
    if (!unidades.includes(d.unidad_destino_id)) {
      throw new AppError('Solo el encargado del área destino puede enviar la respuesta', 403);
    }
    if (d.estado !== 'EN_REVISION') {
      throw new AppError('Aún no hay una respuesta lista para enviar', 422);
    }
    // Basta la justificación: puede no haber documento cuando la respuesta es
    // que no se encontró información.
    if (!d.observacion) {
      throw new AppError('Falta la justificación de la respuesta', 422);
    }

    await db.transaction(async (trx) => {
      await trx('oficio_delegatorios').where({ id }).update({
        estado: 'CONTESTADO', respondido_en: new Date(), actualizado_en: new Date(),
      });
      await registrarComentario(trx, id, user.id, 'Respuesta enviada a quien la solicitó', d.estado);
    });

    avisar({
      event: 'DELEGATORIO_CONTESTADO', usuarioIds: [d.solicitado_por_id], oficio_id: d.oficio_id,
      nota: d.observacion, ...(await contextoDelegatorio(d.oficio_id, d.unidad_destino_id)),
    });

    res.json({ message: 'Respuesta enviada a quien solicitó el delegatorio' });
  } catch (err) { next(err); }
}

// ── PATCH /delegatorios/:id/rechazar ─────────────────────────
/**
 * El área destino regresa el delegatorio a quien lo detonó, porque el asunto no
 * le compete. Convive con responder: si el área sí puede atenderlo, sube su
 * documento y su observación como siempre; si no, lo rechaza justificando.
 *
 * Un delegatorio rechazado deja de contar como pendiente, así que ya no bloquea
 * el visto bueno ni la firma del oficio.
 */
export async function rechazarDelegatorio(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const d    = await getDelegatorioOrFail(id);

    const motivo = String(req.body?.motivo ?? '').trim().toUpperCase();
    if (!motivo) throw new AppError('Indica por qué no le compete a tu área', 422);

    // Solo el encargado del área destino: rechazar habla por toda el área, no
    // por la persona a quien se le haya asignado.
    const unidades = await unidadesDelEncargado(user.id);
    if (!unidades.includes(d.unidad_destino_id)) {
      throw new AppError('Solo el encargado del área destino puede rechazar el delegatorio', 403);
    }
    // Solo mientras nadie del área la haya tomado. Asignarla ya es aceptarla, y
    // rechazar después contradice el expediente: alguien la estuvo trabajando.
    if (d.estado !== 'PENDIENTE') {
      throw new AppError(
        'Tu área ya tomó esta solicitud. Si al final no le compete, contéstala explicándolo o pídele a quien la mandó que la cancele.',
        409,
      );
    }

    await db.transaction(async (trx) => {
      await trx('oficio_delegatorios').where({ id }).update({
        estado: 'RECHAZADO', actualizado_en: new Date(),
      });
      await registrarComentario(trx, id, user.id, `No compete a esta área: ${motivo}`, d.estado);
    });

    const ctx = await contextoDelegatorio(d.oficio_id, d.unidad_destino_id);
    avisar({
      event: 'DELEGATORIO_DEVUELTO', usuarioIds: [d.solicitado_por_id],
      oficio_id: d.oficio_id, nota: `No compete a ${ctx.area ?? 'esa área'}: ${motivo}`, ...ctx,
    });

    res.json({ message: 'Delegatorio rechazado y regresado a quien lo solicitó' });
  } catch (err) { next(err); }
}

// ── PATCH /delegatorios/:id/cancelar ─────────────────────────
/**
 * Quien pidió cierra su propia solicitud, con motivo.
 *
 * Mientras una solicitud siga abierta, el oficio de quien la pidió no puede
 * recibir visto bueno ni firma. Antes eso solo dependía de que el área destino
 * contestara: si se olvidaba, el trámite quedaba parado y no había forma de
 * sacarlo. Sirve cuando ya no se necesita la información, o cuando se le pidió
 * al área que no era.
 *
 * Es distinto de RECHAZADO —que es el área destino diciendo «no me compete»— y
 * por eso queda con su propio estado: en el expediente no deben verse iguales.
 * No se puede cancelar lo que ya se contestó: esa información ya existe.
 */
export async function cancelarDelegatorio(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const d    = await getDelegatorioOrFail(id);

    const motivo = String(req.body?.motivo ?? '').trim().toUpperCase();
    if (!motivo) throw new AppError('Indica por qué cancelas la solicitud', 422);

    // Cancela quien puede pedir sobre ese oficio, no únicamente quien tecleó la
    // solicitud: si esa persona sale de vacaciones, su área no puede quedarse
    // sin forma de destrabar el oficio.
    if (!(await puedeDetonar(user, d.oficio_id))) {
      throw new AppError('Solo el área que solicitó la información puede cancelarla', 403);
    }
    if (d.estado === 'CONTESTADO') throw new AppError('Esta solicitud ya fue contestada', 422);
    if (d.estado === 'CANCELADO')  throw new AppError('Esta solicitud ya está cancelada', 422);
    if (d.estado === 'RECHAZADO')  throw new AppError('Esta solicitud ya fue rechazada por el área destino', 422);

    await db.transaction(async (trx) => {
      await trx('oficio_delegatorios').where({ id }).update({
        estado: 'CANCELADO', cancelado_en: new Date(), cancelado_por_id: user.id,
        actualizado_en: new Date(),
      });
      await registrarComentario(trx, id, user.id, `Cancelada: ${motivo}`, d.estado);
    });

    // Avisa al área destino para que deje de trabajar en algo que ya no se
    // espera, y a quien la tuviera asignada, que es quien lo estaba haciendo.
    const aAvisar = new Set<number>(await encargadosDeUnidad(d.unidad_destino_id));
    if (d.asignado_a_id) aAvisar.add(d.asignado_a_id);
    avisar({
      event: 'DELEGATORIO_DEVUELTO', usuarioIds: [...aAvisar], oficio_id: d.oficio_id,
      nota: `Solicitud cancelada: ${motivo}`,
      ...(await contextoDelegatorio(d.oficio_id, d.unidad_destino_id)),
    });

    res.json({ message: 'Solicitud cancelada' });
  } catch (err) { next(err); }
}

// ── GET /delegatorios/:id/historial ──────────────────────────
export async function historialDelegatorio(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    const filas = await db('delegatorio_comentarios as c')
      .leftJoin('usuarios as u', 'u.id', 'c.usuario_id')
      .where('c.delegatorio_id', id)
      .select('c.id', 'c.comentario', 'c.estado_previo', 'c.creado_en', 'u.nombre as usuario')
      .orderBy('c.creado_en', 'asc');
    res.json({ data: filas });
  } catch (err) { next(err); }
}

// ── GET /delegatorios/areas-destino ──────────────────────────
/**
 * Las áreas a las que se puede dirigir este oficio, según dónde vive hoy.
 *
 * Antes la lista se recortaba preguntando si la *persona* era de Jurídica, y
 * había que parchar una excepción para que Informática asomara cuando el oficio
 * traía FRE. Las dos cosas desaparecen: la pregunta es por el oficio, y lo que
 * cada área puede o no puede se configura, no se programa.
 */
export async function areasDestino(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const oficioId = Number(req.query.oficio_id) || 0;
    if (!oficioId) throw new AppError('Falta el oficio del que se piden los destinos', 422);

    const origen = await unidadDelOficio(oficioId);
    if (!origen) throw new AppError('El oficio no está en ningún área', 422);

    res.json({ data: await destinosPermitidos(origen) });
  } catch (err) { next(err); }
}
