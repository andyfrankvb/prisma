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
import { esDeJuridica, unidadInformatica } from './oficios.controller';
import { diasHabilesEntre } from '../../utils/dias-habiles';
import { logger }   from '../../utils/logger';

/** Una fecha —venga como Date o como texto— al inicio de su día. */
function aMedianoche(valor: Date | string): Date {
  const d = valor instanceof Date ? new Date(valor.getTime()) : new Date(`${String(valor).slice(0, 10)}T00:00:00`);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Estados por los que pasa un delegatorio. */
type EstadoDelegatorio =
  | 'PENDIENTE' | 'ASIGNADO' | 'EN_REVISION' | 'CONTESTADO'
  /** El área lo regresó por no ser de su competencia. */
  | 'RECHAZADO';

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
 * ¿Puede este usuario detonar un delegatorio de este oficio?
 * Solo desde la Dirección General: su encargado o el jurídico que lo tiene asignado.
 */
async function puedeDetonar(user: any, oficioId: number): Promise<boolean> {
  const oficio = await db('oficios as o')
    .leftJoin('usuarios as dir', 'dir.id', 'o.dirigido_a_id')
    .leftJoin('catalogo_unidades as cu', 'cu.id', 'dir.unidad_id')
    .where('o.id', oficioId)
    .select('o.id', 'dir.unidad_id as unidad_destino', 'cu.tipo as unidad_tipo')
    .first();
  if (!oficio) throw new AppError('Oficio no encontrado', 404);
  // Solo aplica a oficios dirigidos a la Dirección General.
  if (oficio.unidad_tipo !== 'DIRECCION_GENERAL') return false;

  // El encargado de la Dirección General.
  const unidades = await unidadesDelEncargado(user.id);
  if (oficio.unidad_destino && unidades.includes(oficio.unidad_destino)) return true;

  // O el jurídico que tiene el oficio asignado actualmente.
  const asignacion = await db('asignaciones_juridicas')
    .where({ oficio_id: oficioId })
    .orderBy('id', 'desc')
    .first();
  return asignacion?.abogado_id === user.id;
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
    const filas = await db('oficio_delegatorios as d')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'd.unidad_destino_id')
      .leftJoin('usuarios as sol', 'sol.id', 'd.solicitado_por_id')
      .leftJoin('usuarios as asig', 'asig.id', 'd.asignado_a_id')
      .leftJoin('usuarios as resp', 'resp.id', 'd.respondido_por_id')
      .where('d.oficio_id', oficioId)
      .select(
        'd.id', 'd.estado', 'd.descripcion', 'd.documento_url', 'd.observacion',
        'd.creado_en', 'd.respondido_en', 'd.unidad_destino_id', 'd.fecha_vencimiento',
        'cu.nombre as area',
        'sol.nombre as solicitado_por',
        'asig.nombre as asignado_a',
        'resp.nombre as respondido_por',
      )
      .orderBy('cu.nombre', 'asc');

    // Cuánto lleva cada área y si ya se pasó de su plazo. Se cuenta hasta que
    // contestó; después de eso el reloj deja de correr.
    const hoy = new Date();
    const conPlazo = filas.map((f: any) => {
      const corte = f.respondido_en ? new Date(f.respondido_en) : hoy;
      const dias_transcurridos = diasHabilesEntre(new Date(f.creado_en), corte);
      let dias_restantes: number | null = null;
      let vencido = false;
      if (f.fecha_vencimiento) {
        // La columna DATE llega como Date desde el driver, no como texto.
        const limite = aMedianoche(f.fecha_vencimiento);
        const referencia = aMedianoche(corte);
        dias_restantes = diasHabilesEntre(referencia, limite);
        vencido = referencia > limite;
      }
      return { ...f, dias_transcurridos, dias_restantes, vencido };
    });

    res.json({
      data: conPlazo,
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
      throw new AppError('Solo el encargado de la Dirección General o el jurídico asignado pueden delegar este oficio', 403);
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

    // Destinos válidos: delegaciones y direcciones de área. La Dirección General
    // queda fuera: es de donde sale el delegatorio.
    const validas = await db('catalogo_unidades')
      .whereIn('id', unidades)
      .whereIn('tipo', ['DELEGACION', 'DIRECCION'])
      .andWhere('activo', true)
      .pluck('id');
    if (validas.length !== unidades.length) {
      throw new AppError('Alguna de las áreas seleccionadas no es un destino válido', 422);
    }

    // Áreas a las que ya se delegó este oficio: no se duplican. Las que lo
    // rechazaron sí se pueden volver a intentar, por si el rechazo fue un error.
    const yaDelegadas = await db('oficio_delegatorios')
      .where('oficio_id', oficioId)
      .whereIn('unidad_destino_id', validas)
      .whereNot('estado', 'RECHAZADO')
      .pluck('unidad_destino_id');
    const rechazadas = await db('oficio_delegatorios')
      .where('oficio_id', oficioId)
      .whereIn('unidad_destino_id', validas)
      .andWhere('estado', 'RECHAZADO')
      .pluck('unidad_destino_id');
    const nuevas = validas.filter((u: number) => !yaDelegadas.includes(u));
    if (!nuevas.length) {
      throw new AppError('Ese oficio ya fue delegado a las áreas seleccionadas', 409);
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
        // Reintento sobre un rechazo previo: se reabre el mismo registro.
        if (rechazadas.includes(unidadId)) {
          const [fila] = await trx('oficio_delegatorios')
            .where({ oficio_id: oficioId, unidad_destino_id: unidadId })
            .update({
              descripcion, estado: 'PENDIENTE', solicitado_por_id: user.id,
              asignado_a_id: null, documento_url: null, observacion: null,
              respondido_por_id: null, actualizado_en: new Date(),
              fecha_vencimiento: plazoDe(unidadId),
            })
            .returning('id');
          await registrarComentario(trx, Number(fila.id ?? fila), user.id,
            `Delegatorio reenviado: ${descripcion}`, 'RECHAZADO');
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
        await registrarComentario(trx, Number(fila.id ?? fila), user.id, `Delegatorio enviado: ${descripcion}`, 'PENDIENTE');
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
    if (!observacion) throw new AppError('La justificación es obligatoria', 422);
    if (!req.file && !d.documento_url) throw new AppError('Adjunta el documento de respuesta', 422);

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
    if (!d.documento_url || !d.observacion) {
      throw new AppError('Falta el documento o la justificación', 422);
    }

    await db.transaction(async (trx) => {
      await trx('oficio_delegatorios').where({ id }).update({
        estado: 'CONTESTADO', respondido_en: new Date(), actualizado_en: new Date(),
      });
      await registrarComentario(trx, id, user.id, 'Respuesta enviada a la Dirección General', d.estado);
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
    if (d.estado === 'RECHAZADO')  throw new AppError('Este delegatorio ya fue rechazado', 422);
    if (d.estado === 'CONTESTADO') throw new AppError('Este delegatorio ya fue contestado', 422);

    await db.transaction(async (trx) => {
      await trx('oficio_delegatorios').where({ id }).update({
        estado: 'RECHAZADO', actualizado_en: new Date(),
      });
      await registrarComentario(trx, id, user.id, `Rechazado: ${motivo}`, d.estado);
    });

    const ctx = await contextoDelegatorio(d.oficio_id, d.unidad_destino_id);
    avisar({
      event: 'DELEGATORIO_DEVUELTO', usuarioIds: [d.solicitado_por_id],
      oficio_id: d.oficio_id, nota: `No compete a ${ctx.area ?? 'esa área'}: ${motivo}`, ...ctx,
    });

    res.json({ message: 'Delegatorio rechazado y regresado a quien lo solicitó' });
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
// Delegaciones y direcciones de área. La Dirección General no aparece.
export async function areasDestino(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    // La Dirección Jurídica —su encargado y sus abogados— delega hacia las
    // delegaciones, no hacia las otras direcciones de área.
    const esJuridica = await esDeJuridica(req.user);
    const tipos = esJuridica ? ['DELEGACION'] : ['DELEGACION', 'DIRECCION'];

    const areas = await db('catalogo_unidades')
      .whereIn('tipo', tipos)
      .andWhere('activo', true)
      .select('id', 'nombre', 'tipo')
      .orderBy('tipo', 'asc')
      .orderBy('nombre', 'asc');

    // Excepción: si el oficio tiene marcada la incorporación de FRE, tiene que
    // poder delegarse a Informática aunque quien pregunta sea de Jurídica —de
    // otro modo la regla del FRE sería imposible de cumplir.
    const oficioId = Number(req.query.oficio_id) || 0;
    if (esJuridica && oficioId) {
      const oficio = await db('oficios').where({ id: oficioId }).select('fre_incorporado').first();
      if (oficio?.fre_incorporado) {
        const informatica = await unidadInformatica();
        if (informatica && !areas.some((a: any) => a.id === informatica.id)) {
          areas.push({ ...informatica, tipo: 'DIRECCION' });
        }
      }
    }

    res.json({ data: areas });
  } catch (err) { next(err); }
}
