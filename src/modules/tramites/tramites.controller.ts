/**
 * Controller: Seguimiento de Trámites
 * File: src/modules/tramites/tramites.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  POST   /tramites                          → crearTramite
 *  GET    /tramites                          → listarTramites
 *  GET    /tramites/:id                      → obtenerTramite
 *  PATCH  /tramites/:id/aprobar              → aprobarTramite
 *  PATCH  /tramites/:id/rechazar             → rechazarTramite
 *  PATCH  /tramites/:id/devolver-delegado    → devolverAlDelegado
 *  PATCH  /tramites/:id/cerrar               → cerrarProceso
 *  PATCH  /tramites/:id/finalizar            → cerrarProceso (alias)
 *  PATCH  /tramites/:id/devolver-juridico    → devolverAlJuridico
 *  PATCH  /tramites/:id/reenviar             → reenviarDesdeDevuelto
 *  PATCH  /tramites/:id/reenviar-juridico    → reenviarDesdeDevueltoJuridico
 *  POST   /tramites/:id/comentarios          → agregarComentario
 *  GET    /tramites/:id/comentarios          → listarComentarios
 */

import { Request, Response, NextFunction } from 'express';
import { db }      from '../../db';
import { storage } from '../../services/storage.service';
import { AppError } from '../../utils/AppError';
import { logger }  from '../../utils/logger';
import { notifyTramite } from '../../notifications/notification.dispatcher';
import { getActorFlujo } from '../../services/flujo-config.service';
import {
  EstatusTramite,
  isValidTramiteTransition,
  type CrearTramiteBody,
  type AprobarTramiteBody,
  type RechazarTramiteBody,
  type FinalizarTramiteBody,
  type AgregarComentarioBody,
} from './tramites.types';

// ── Additional body types ─────────────────────────────────────
interface DevolverDelegadoBody  { comentario: string; }
interface DevolverJuridicoBody  { comentario: string; }
interface ReenviarDevueltoBody  {
  nombre_solicitante?:      string;
  correo_solicitante?:      string;
  telefono_solicitante?:    string;
  checklist_documentacion?: boolean;
  checklist_proyecto?:      boolean;
  comentarios?:             string;
  comentario?:              string;
}
interface ReenviarJuridicoBody  { comentario: string; }

// ── Helpers ───────────────────────────────────────────────────

async function getTramiteOrFail(trx: any, id: number) {
  const tramite = await trx('tramites').where({ id }).first();
  if (!tramite) throw new AppError('Trámite no encontrado', 404);
  return tramite;
}

async function createAuditLog(
  trx: any,
  tramite_id: number,
  estado_anterior: EstatusTramite | null,
  estado_nuevo: EstatusTramite,
  usuario_id: number,
  comentario?: string,
): Promise<void> {
  await trx('auditoria_tramites').insert({
    tramite_id,
    estado_anterior,
    estado_nuevo,
    usuario_id,
    fecha_cambio: new Date(),
    ...(comentario !== undefined ? { comentario } : {}),
  });
}

/** Determina si el usuario puede ver/interactuar con trámites */
async function getUserTramiteRole(user: any): Promise<
  'creador' | 'revisor' | 'finalizador' | 'supervisora' | 'observador' | null
> {
  // Cualquier usuario de Dirección General (la DG y sus asistentes observadores)
  // tiene vista de supervisión: ve todos los trámites en solo lectura.
  if ((user as any).unidad_tipo === 'DIRECCION_GENERAL') return 'supervisora';

  if (user.rol === 'DIRECTOR') {
    const unidad = await db('catalogo_unidades')
      .where({ id: user.oficina_id })
      .select('tipo')
      .first();

    if (!unidad) return null;
    if (unidad.tipo === 'DIRECCION_GENERAL') return 'supervisora';
    if (unidad.tipo === 'DELEGACION') return 'creador';
    const revisorId = await getActorFlujo('tramites_seguimiento', 'REVISOR').catch(() => null);
    if (revisorId !== null && user.id === revisorId) return 'revisor';
    return null;
  }

  if (user.rol === 'PARTICULAR') return 'supervisora';

  if (user.rol === 'OPERATIVO') {
    const unidad = await db('catalogo_unidades')
      .where({ id: user.oficina_id })
      .select('tipo')
      .first();

    if (!unidad) return null;
    // En una delegación, el jefe/jefa (DIRECTOR) sube los tickets.
    // Los demás miembros con el módulo asignado SOLO observan los de su delegación.
    if (unidad.tipo === 'DELEGACION') return 'observador';
    const finalizadorId = await getActorFlujo('tramites_seguimiento', 'FINALIZADOR').catch(() => null);
    if (finalizadorId !== null && user.id === finalizadorId) return 'finalizador';
    return null;
  }

  return null;
}

// ── POST /tramites ────────────────────────────────────────────

export async function crearTramite(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const {
      descripcion,
      numero_ticket,
      nombre_solicitante,
      correo_solicitante,
      telefono_solicitante,
      checklist_documentacion,
      checklist_proyecto,
    } = req.body as CrearTramiteBody;

    // Validaciones de campos obligatorios
    if (!descripcion?.trim())          throw new AppError('La descripción es requerida', 422);
    if (!numero_ticket?.trim())        throw new AppError('El número de ticket es requerido', 422);
    if (!nombre_solicitante?.trim())   throw new AppError('El nombre del solicitante es requerido', 422);
    if (!correo_solicitante?.trim())   throw new AppError('El correo del solicitante es requerido', 422);
    if (!telefono_solicitante?.trim()) throw new AppError('El teléfono del solicitante es requerido', 422);

    // Validar checklists obligatorios
    if (checklist_documentacion !== true) {
      throw new AppError('Debe confirmar que la documentación está correctamente adjunta (checklist_documentacion)', 422);
    }
    if (checklist_proyecto !== true) {
      throw new AppError('Debe confirmar que el proyecto de resolución fue remitido por correo (checklist_proyecto)', 422);
    }

    // Verificar que el usuario es creador (delegado u operativo de delegación)
    const tramiteRole = await getUserTramiteRole(user);
    if (tramiteRole !== 'creador') {
      throw new AppError('Solo los delegados y su equipo pueden crear trámites', 403);
    }

    // Generar folio: número natural secuencial global
    const [{ max_folio }] = await db('tramites')
      .max('id as max_folio');
    const folio = String(Number(max_folio ?? 0) + 1);

    // Guardar archivos adjuntos si los hay
    const archivos: { url: string; nombre: string }[] = [];
    let totalOriginal = 0;
    let totalFinal    = 0;
    let huboCompresion = false;
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files as Express.Multer.File[]) {
        if (file.size > 10 * 1024 * 1024) {
          throw new AppError(`El archivo ${file.originalname} supera el límite de 10 MB`, 422);
        }
        const guardado = await storage.saveWithInfo(file, 'tramites/adjuntos');
        archivos.push({ url: guardado.url, nombre: file.originalname });
        totalOriginal += guardado.originalSize;
        totalFinal    += guardado.finalSize;
        if (guardado.compressed) huboCompresion = true;
      }
    }
    const compresion = huboCompresion
      ? {
          original_bytes: totalOriginal,
          final_bytes:    totalFinal,
          ahorro_pct:     Math.round((1 - totalFinal / totalOriginal) * 100),
        }
      : null;

    const fechaRegistro = new Date();

    // Transacción
    const tramite = await db.transaction(async (trx) => {
      const [nuevo] = await trx('tramites').insert({
        folio,
        descripcion:             descripcion.trim(),
        numero_ticket:           numero_ticket.trim(),
        nombre_solicitante:      nombre_solicitante.trim(),
        correo_solicitante:      correo_solicitante.trim(),
        telefono_solicitante:    telefono_solicitante.trim(),
        checklist_documentacion,
        checklist_proyecto,
        estatus:                 'NUEVO' as EstatusTramite,
        unidad_creadora_id:      user.oficina_id,
        creado_por_id:           user.id,
        fecha_creacion:          new Date(),
        fecha_registro:          fechaRegistro,
      }).returning('*');

      // Guardar documentos adjuntos
      for (const archivo of archivos) {
        await trx('tramite_documentos').insert({
          tramite_id:      nuevo.id,
          archivo_url:     archivo.url,
          nombre_original: archivo.nombre,
          subido_por_id:   user.id,
          subido_en:       new Date(),
        });
      }

      await createAuditLog(trx, nuevo.id, null, 'NUEVO', user.id);
      return nuevo;
    });

    // Notificar al Revisor (Director Jurídico, configurado en flujo)
    const revisorId = await getActorFlujo('tramites_seguimiento', 'REVISOR').catch(() => null);
    const revisor = revisorId
      ? await db('usuarios').where({ id: revisorId }).select('id').first()
      : null;

    if (revisor) {
      notifyTramite({
        recipient_id: revisor.id,
        event:        'TRAMITE_NUEVO',
        title:        'Nuevo trámite recibido',
        body:         `${user.nombre} creó el trámite ${folio}`,
        tramite_id:   tramite.id,
        folio,
      }).catch(() => {});
    }

    res.status(201).json({ data: tramite, message: 'Trámite creado correctamente', compresion });
  } catch (err) { next(err); }
}

// ── GET /tramites ─────────────────────────────────────────────

export async function listarTramites(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const tramiteRole = await getUserTramiteRole(user);
    if (!tramiteRole) throw new AppError('No tienes acceso a este módulo', 403);

    const page   = Math.max(1, parseInt(String(req.query.page  ?? 1), 10));
    const limit  = Math.min(100, parseInt(String(req.query.limit ?? 20), 10));
    const offset = (page - 1) * limit;

    let query = db('tramites as t')
      .join('catalogo_unidades as cu', 'cu.id', 't.unidad_creadora_id')
      .join('usuarios as u', 'u.id', 't.creado_por_id')
      .select(
        't.*',
        'cu.nombre as unidad_nombre',
        'u.nombre as creado_por_nombre',
      );

    // Filtrar según rol
    if (tramiteRole === 'creador' || tramiteRole === 'observador') {
      // El jefe (creador) y los observadores de la delegación ven solo los
      // tickets de su propia delegación, en todos los estatus.
      query = query.where('t.unidad_creadora_id', user.oficina_id);
    } else if (tramiteRole === 'finalizador') {
      // Finalizador ve todos los trámites del sistema
    }
    // revisor y supervisora ven todos

    // Filtros opcionales
    if (req.query.estatus)      query = query.andWhere('t.estatus', req.query.estatus as string);
    if (req.query.tipo_tramite) query = query.andWhere('t.tipo_tramite', req.query.tipo_tramite as string);
    if (req.query.desde)        query = query.andWhere('t.fecha_creacion', '>=', new Date(req.query.desde as string));
    if (req.query.hasta) {
      const hasta = new Date(req.query.hasta as string);
      hasta.setHours(23, 59, 59, 999);
      query = query.andWhere('t.fecha_creacion', '<=', hasta);
    }

    const countRows = await query.clone().clearSelect().count('t.id as count');
    const total     = Number((countRows[0] as any)?.count ?? 0);
    const tramites  = await query.orderBy('t.fecha_creacion', 'desc').limit(limit).offset(offset);

    res.json({ data: tramites, meta: { total, page, limit } });
  } catch (err) { next(err); }
}

// ── GET /tramites/:id ─────────────────────────────────────────

export async function obtenerTramite(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);

    const tramiteRole = await getUserTramiteRole(user);
    if (!tramiteRole) throw new AppError('No tienes acceso a este módulo', 403);

    const tramite = await db('tramites as t')
      .join('catalogo_unidades as cu', 'cu.id', 't.unidad_creadora_id')
      .join('usuarios as u', 'u.id', 't.creado_por_id')
      .select('t.*', 'cu.nombre as unidad_nombre', 'u.nombre as creado_por_nombre')
      .where('t.id', id)
      .first();

    if (!tramite) throw new AppError('Trámite no encontrado', 404);

    // Verificar acceso — creador y observador solo ven su propia delegación
    if ((tramiteRole === 'creador' || tramiteRole === 'observador') && tramite.unidad_creadora_id !== user.oficina_id) {
      throw new AppError('No tienes acceso a este trámite', 403);
    }
    // finalizador puede ver el detalle de cualquier trámite

    // Si el revisor abre un trámite NUEVO → cambia a EN_REVISION automáticamente
    if (tramiteRole === 'revisor' && tramite.estatus === 'NUEVO') {
      await db.transaction(async (trx) => {
        await trx('tramites').where({ id }).update({ estatus: 'EN_REVISION' });
        await createAuditLog(trx, id, 'NUEVO', 'EN_REVISION', user.id);
      });
      tramite.estatus = 'EN_REVISION';
    }

    // Documentos adjuntos
    const documentos = await db('tramite_documentos as td')
      .join('usuarios as u', 'u.id', 'td.subido_por_id')
      .select('td.*', 'u.nombre as subido_por_nombre')
      .where('td.tramite_id', id)
      .orderBy('td.subido_en', 'asc');

    // Historial de auditoría
    const auditoria = await db('auditoria_tramites as a')
      .join('usuarios as u', 'u.id', 'a.usuario_id')
      .select('a.*', 'u.nombre as usuario_nombre')
      .where('a.tramite_id', id)
      .orderBy('a.fecha_cambio', 'asc');

    res.json({ data: { ...tramite, documentos, auditoria } });
  } catch (err) { next(err); }
}

// ── PATCH /tramites/:id/aprobar ───────────────────────────────

export async function aprobarTramite(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const { fecha_compromiso, comentario } = req.body as AprobarTramiteBody;

    // Solo el revisor (Director Jurídico, unidad_id=36)
    const tramiteRole = await getUserTramiteRole(user);
    if (tramiteRole !== 'revisor') {
      throw new AppError('Solo el Director Jurídico puede aprobar trámites', 403);
    }

    if (!comentario?.trim()) {
      throw new AppError('El comentario es obligatorio para aprobar', 422);
    }
    if (!fecha_compromiso) {
      throw new AppError('La fecha compromiso es requerida para aprobar', 422);
    }
    const fechaComp = new Date(fecha_compromiso);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (fechaComp < hoy) {
      throw new AppError('La fecha compromiso no puede ser en el pasado', 422);
    }

    await db.transaction(async (trx) => {
      let tramite = await getTramiteOrFail(trx, id);
      // Si el revisor actúa desde la tarjeta sobre un trámite NUEVO, lo toma:
      // auto-avanza NUEVO → EN_REVISION (igual que al abrir el detalle).
      if (tramite.estatus === 'NUEVO') {
        await trx('tramites').where({ id }).update({ estatus: 'EN_REVISION' as EstatusTramite });
        await createAuditLog(trx, id, 'NUEVO', 'EN_REVISION', user.id, null);
        tramite = { ...tramite, estatus: 'EN_REVISION' };
      }
      if (!isValidTramiteTransition(tramite.estatus, 'EN_PROCESO')) {
        throw new AppError(`Transición inválida: ${tramite.estatus} → EN_PROCESO`, 422);
      }
      await trx('tramites').where({ id }).update({
        estatus:          'EN_PROCESO' as EstatusTramite,
        fecha_compromiso,
      });
      await createAuditLog(trx, id, tramite.estatus, 'EN_PROCESO', user.id, comentario.trim());
    });

    // Notificar al creador y al finalizador
    const tramite = await db('tramites').where({ id }).first();
    const creador = await db('usuarios').where({ id: tramite.creado_por_id }).first();
    const finalizadorId = await getActorFlujo('tramites_seguimiento', 'FINALIZADOR').catch(() => null);
    const finalizador = finalizadorId
      ? await db('usuarios').where({ id: finalizadorId }).first()
      : null;

    if (creador) {
      notifyTramite({
        recipient_id: creador.id,
        event:        'TRAMITE_APROBADO',
        title:        'Trámite aprobado',
        body:         `Tu trámite ${tramite.folio} fue aprobado. Fecha compromiso: ${fecha_compromiso}`,
        tramite_id:   id,
        folio:        tramite.folio,
      }).catch(() => {});
    }
    if (finalizador) {
      notifyTramite({
        recipient_id: finalizador.id,
        event:        'TRAMITE_APROBADO',
        title:        'Nuevo trámite para finalizar',
        body:         `El trámite ${tramite.folio} está listo para cierre. Fecha compromiso: ${fecha_compromiso}`,
        tramite_id:   id,
        folio:        tramite.folio,
      }).catch(() => {});
    }

    res.json({ message: 'Trámite aprobado correctamente' });
  } catch (err) { next(err); }
}

// ── PATCH /tramites/:id/rechazar ──────────────────────────────

export async function rechazarTramite(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const { comentario } = req.body as RechazarTramiteBody;

    const tramiteRole = await getUserTramiteRole(user);
    if (tramiteRole !== 'revisor') {
      throw new AppError('Solo el Director Jurídico puede rechazar trámites', 403);
    }
    if (!comentario?.trim()) {
      throw new AppError('El comentario de justificación es obligatorio para rechazar', 422);
    }

    await db.transaction(async (trx) => {
      let tramite = await getTramiteOrFail(trx, id);
      if (tramite.estatus === 'NUEVO') {
        await trx('tramites').where({ id }).update({ estatus: 'EN_REVISION' as EstatusTramite });
        await createAuditLog(trx, id, 'NUEVO', 'EN_REVISION', user.id, null);
        tramite = { ...tramite, estatus: 'EN_REVISION' };
      }
      if (!isValidTramiteTransition(tramite.estatus, 'RECHAZADO')) {
        throw new AppError(`Transición inválida: ${tramite.estatus} → RECHAZADO`, 422);
      }
      await trx('tramites').where({ id }).update({ estatus: 'RECHAZADO' as EstatusTramite });
      await trx('comentarios_tramite').insert({
        tramite_id: id,
        autor_id:   user.id,
        contenido:  comentario.trim(),
        creado_en:  new Date(),
      });
      await createAuditLog(trx, id, tramite.estatus, 'RECHAZADO', user.id, comentario.trim());
    });

    // Notificar al creador
    const tramite = await db('tramites').where({ id }).first();
    const creador = await db('usuarios').where({ id: tramite.creado_por_id }).first();
    if (creador) {
      notifyTramite({
        recipient_id: creador.id,
        event:        'TRAMITE_RECHAZADO',
        title:        'Trámite rechazado',
        body:         `Tu trámite ${tramite.folio} fue rechazado. Motivo: ${comentario.trim().slice(0, 100)}`,
        tramite_id:   id,
        folio:        tramite.folio,
      }).catch(() => {});
    }

    res.json({ message: 'Trámite rechazado' });
  } catch (err) { next(err); }
}

// ── PATCH /tramites/:id/cerrar (alias: /finalizar) ───────────

export async function cerrarProceso(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const { comentario } = req.body as FinalizarTramiteBody;

    const tramiteRole = await getUserTramiteRole(user);
    if (tramiteRole !== 'finalizador') {
      throw new AppError('Solo el personal autorizado puede cerrar trámites', 403);
    }
    if (!comentario?.trim()) {
      throw new AppError('El comentario de cierre es obligatorio para cerrar el proceso', 422);
    }

    const fechaCierre = new Date();

    await db.transaction(async (trx) => {
      const tramite = await getTramiteOrFail(trx, id);
      if (!isValidTramiteTransition(tramite.estatus, 'FINALIZADO')) {
        throw new AppError(`Transición inválida: ${tramite.estatus} → FINALIZADO (se requiere estatus EN_PROCESO)`, 422);
      }
      await trx('tramites').where({ id }).update({
        estatus:      'FINALIZADO' as EstatusTramite,
        fecha_cierre: fechaCierre,
      });
      await trx('comentarios_tramite').insert({
        tramite_id: id,
        autor_id:   user.id,
        contenido:  comentario.trim(),
        creado_en:  fechaCierre,
      });
      await createAuditLog(trx, id, 'EN_PROCESO', 'FINALIZADO', user.id, comentario.trim());
    });

    // Notificar al creador y al revisor
    const tramite = await db('tramites').where({ id }).first();
    const creador = await db('usuarios').where({ id: tramite.creado_por_id }).first();
    const revisorId = await getActorFlujo('tramites_seguimiento', 'REVISOR').catch(() => null);
    const revisor = revisorId
      ? await db('usuarios').where({ id: revisorId }).first()
      : null;

    for (const dest of [creador, revisor].filter(Boolean)) {
      notifyTramite({
        recipient_id: dest.id,
        event:        'TRAMITE_FINALIZADO',
        title:        'Trámite finalizado',
        body:         `El trámite ${tramite.folio} fue cerrado el ${fechaCierre.toLocaleDateString('es-MX')}`,
        tramite_id:   id,
        folio:        tramite.folio,
      }).catch(() => {});
    }

    res.json({ message: 'Trámite cerrado correctamente' });
  } catch (err) { next(err); }
}

/** Alias de compatibilidad hacia atrás */
export const finalizarTramite = cerrarProceso;

// ── PATCH /tramites/:id/devolver-delegado ─────────────────────

export async function devolverAlDelegado(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const { comentario } = req.body as DevolverDelegadoBody;

    const tramiteRole = await getUserTramiteRole(user);
    if (tramiteRole !== 'revisor') {
      throw new AppError('Solo el Director Jurídico puede devolver trámites al delegado', 403);
    }
    if (!comentario?.trim()) {
      throw new AppError('El comentario es obligatorio para devolver al delegado', 422);
    }

    await db.transaction(async (trx) => {
      let tramite = await getTramiteOrFail(trx, id);
      if (tramite.estatus === 'NUEVO') {
        await trx('tramites').where({ id }).update({ estatus: 'EN_REVISION' as EstatusTramite });
        await createAuditLog(trx, id, 'NUEVO', 'EN_REVISION', user.id, null);
        tramite = { ...tramite, estatus: 'EN_REVISION' };
      }
      if (!isValidTramiteTransition(tramite.estatus, 'DEVUELTO_DELEGADO')) {
        throw new AppError(`Transición inválida: ${tramite.estatus} → DEVUELTO_DELEGADO`, 422);
      }
      await trx('tramites').where({ id }).update({ estatus: 'DEVUELTO_DELEGADO' as EstatusTramite });
      await trx('comentarios_tramite').insert({
        tramite_id: id,
        autor_id:   user.id,
        contenido:  comentario.trim(),
        creado_en:  new Date(),
      });
      await createAuditLog(trx, id, tramite.estatus, 'DEVUELTO_DELEGADO', user.id, comentario.trim());
    });

    // Notificar al creador del trámite
    const tramite = await db('tramites').where({ id }).first();
    notifyTramite({
      recipient_id: tramite.creado_por_id,
      event:        'TRAMITE_DEVUELTO_DELEGADO',
      title:        'Trámite devuelto',
      body:         `Tu trámite ${tramite.folio} fue devuelto. Motivo: ${comentario.trim().slice(0, 100)}`,
      tramite_id:   id,
      folio:        tramite.folio,
    }).catch(() => {});

    res.json({ message: 'Trámite devuelto al delegado' });
  } catch (err) { next(err); }
}

// ── PATCH /tramites/:id/devolver-juridico ─────────────────────

export async function devolverAlJuridico(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const { comentario } = req.body as DevolverJuridicoBody;

    const tramiteRole = await getUserTramiteRole(user);
    if (tramiteRole !== 'finalizador') {
      throw new AppError('Solo el personal de TICS puede devolver trámites al jurídico', 403);
    }
    if (!comentario?.trim()) {
      throw new AppError('El comentario es obligatorio para devolver al jurídico', 422);
    }

    await db.transaction(async (trx) => {
      const tramite = await getTramiteOrFail(trx, id);
      if (!isValidTramiteTransition(tramite.estatus, 'DEVUELTO_JURIDICO')) {
        throw new AppError(`Transición inválida: ${tramite.estatus} → DEVUELTO_JURIDICO`, 422);
      }
      await trx('tramites').where({ id }).update({ estatus: 'DEVUELTO_JURIDICO' as EstatusTramite });
      await trx('comentarios_tramite').insert({
        tramite_id: id,
        autor_id:   user.id,
        contenido:  comentario.trim(),
        creado_en:  new Date(),
      });
      await createAuditLog(trx, id, 'EN_PROCESO', 'DEVUELTO_JURIDICO', user.id, comentario.trim());
    });

    // Notificar al revisor (unidad_id=36) — notifyTramite resuelve automáticamente
    const tramite = await db('tramites').where({ id }).first();
    notifyTramite({
      event:      'TRAMITE_DEVUELTO_JURIDICO',
      title:      'Trámite devuelto a Jurídico',
      body:       `El trámite ${tramite.folio} fue devuelto. Motivo: ${comentario.trim().slice(0, 100)}`,
      tramite_id: id,
      folio:      tramite.folio,
    }).catch(() => {});

    res.json({ message: 'Trámite devuelto al jurídico' });
  } catch (err) { next(err); }
}

// ── PATCH /tramites/:id/reenviar ──────────────────────────────

export async function reenviarDesdeDevuelto(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const {
      nombre_solicitante,
      correo_solicitante,
      telefono_solicitante,
      checklist_documentacion,
      checklist_proyecto,
      comentarios,
      comentario,
    } = req.body as ReenviarDevueltoBody;

    const tramiteRole = await getUserTramiteRole(user);
    if (tramiteRole !== 'creador') {
      throw new AppError('Solo el creador puede reenviar un trámite devuelto', 403);
    }

    // Validar checklists obligatorios
    if (checklist_documentacion !== true) {
      throw new AppError('Debe confirmar que la documentación está correctamente adjunta (checklist_documentacion)', 422);
    }
    if (checklist_proyecto !== true) {
      throw new AppError('Debe confirmar que el proyecto de resolución fue remitido por correo (checklist_proyecto)', 422);
    }

    await db.transaction(async (trx) => {
      const tramite = await getTramiteOrFail(trx, id);

      // Verificar que el trámite pertenece a la unidad del creador
      if (tramite.unidad_creadora_id !== user.oficina_id) {
        throw new AppError('No tienes acceso a este trámite', 403);
      }

      if (!isValidTramiteTransition(tramite.estatus, 'NUEVO')) {
        throw new AppError(`Transición inválida: ${tramite.estatus} → NUEVO`, 422);
      }

      // Campos actualizables
      const updates: Record<string, unknown> = {
        estatus:                 'NUEVO' as EstatusTramite,
        checklist_documentacion: true,
        checklist_proyecto:      true,
      };
      if (nombre_solicitante !== undefined)   updates.nombre_solicitante   = nombre_solicitante.trim();
      if (correo_solicitante !== undefined)   updates.correo_solicitante   = correo_solicitante.trim();
      if (telefono_solicitante !== undefined) updates.telefono_solicitante = telefono_solicitante.trim();
      if (comentarios !== undefined && comentarios !== null)
        updates.comentarios = comentarios.trim() || null;

      await trx('tramites').where({ id }).update(updates);
      await createAuditLog(trx, id, 'DEVUELTO_DELEGADO', 'NUEVO', user.id, comentario?.trim());
    });

    res.json({ message: 'Trámite reenviado correctamente' });
  } catch (err) { next(err); }
}

// ── PATCH /tramites/:id/reenviar-juridico ─────────────────────

export async function reenviarDesdeDevueltoJuridico(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const { comentario } = req.body as ReenviarJuridicoBody;

    const tramiteRole = await getUserTramiteRole(user);
    if (tramiteRole !== 'revisor') {
      throw new AppError('Solo el Director Jurídico puede reenviar trámites devueltos por TICS', 403);
    }
    if (!comentario?.trim()) {
      throw new AppError('El comentario es obligatorio para reenviar al jurídico', 422);
    }

    await db.transaction(async (trx) => {
      const tramite = await getTramiteOrFail(trx, id);
      if (!isValidTramiteTransition(tramite.estatus, 'EN_PROCESO')) {
        throw new AppError(`Transición inválida: ${tramite.estatus} → EN_PROCESO`, 422);
      }
      await trx('tramites').where({ id }).update({ estatus: 'EN_PROCESO' as EstatusTramite });
      await trx('comentarios_tramite').insert({
        tramite_id: id,
        autor_id:   user.id,
        contenido:  comentario.trim(),
        creado_en:  new Date(),
      });
      await createAuditLog(trx, id, 'DEVUELTO_JURIDICO', 'EN_PROCESO', user.id, comentario.trim());
    });

    // Notificar al finalizador (configurado en flujo)
    const tramite = await db('tramites').where({ id }).first();
    const finalizadorId = await getActorFlujo('tramites_seguimiento', 'FINALIZADOR').catch(() => null);
    const finalizador = finalizadorId
      ? await db('usuarios').where({ id: finalizadorId }).first()
      : null;

    if (finalizador) {
      notifyTramite({
        recipient_id: finalizador.id,
        event:        'TRAMITE_APROBADO',
        title:        'Trámite listo para cierre',
        body:         `El trámite ${tramite.folio} fue reenviado y está listo para cierre.`,
        tramite_id:   id,
        folio:        tramite.folio,
      }).catch(() => {});
    }

    res.json({ message: 'Trámite reenviado a TICS correctamente' });
  } catch (err) { next(err); }
}

// ── POST /tramites/:id/comentarios ────────────────────────────

export async function agregarComentario(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);
    const { contenido } = req.body as AgregarComentarioBody;

    if (!contenido?.trim()) throw new AppError('El contenido del comentario es requerido', 422);

    const tramiteRole = await getUserTramiteRole(user);
    if (!tramiteRole) throw new AppError('No tienes acceso a este módulo', 403);

    const tramite = await db('tramites').where({ id }).first();
    if (!tramite) throw new AppError('Trámite no encontrado', 404);

    // Verificar acceso al trámite
    if (tramiteRole === 'creador' && tramite.unidad_creadora_id !== user.oficina_id) {
      throw new AppError('No tienes acceso a este trámite', 403);
    }

    // El equipo de la delegación (creador/observador) solo puede aportar
    // información mientras el trámite sigue en su proceso (Ingresados / En proceso).
    // Una vez CERRADO (FINALIZADO o RECHAZADO) ya no puede comentar.
    const ESTADOS_CERRADOS: EstatusTramite[] = ['FINALIZADO', 'RECHAZADO'];
    if ((tramiteRole === 'creador' || tramiteRole === 'observador') &&
        ESTADOS_CERRADOS.includes(tramite.estatus)) {
      throw new AppError('No puedes comentar: el trámite ya está cerrado', 403);
    }

    // El finalizador solo puede comentar en trámites EN_PROCESO o DEVUELTO_JURIDICO
    if (tramiteRole === 'finalizador' &&
        tramite.estatus !== 'EN_PROCESO' &&
        tramite.estatus !== 'DEVUELTO_JURIDICO') {
      throw new AppError('Solo puedes comentar en trámites EN_PROCESO o DEVUELTO_JURIDICO', 403);
    }

    const [comentario] = await db('comentarios_tramite').insert({
      tramite_id: id,
      autor_id:   user.id,
      contenido:  contenido.trim(),
      creado_en:  new Date(),
    }).returning(['id', 'tramite_id', 'autor_id', 'contenido', 'creado_en']);

    // Notificar "mensaje nuevo" a los demás participantes del trámite (no al autor):
    // el creador (delegación), el revisor jurídico y el finalizador.
    const [revisorId, finalizadorId] = await Promise.all([
      getActorFlujo('tramites_seguimiento', 'REVISOR').catch(() => null),
      getActorFlujo('tramites_seguimiento', 'FINALIZADOR').catch(() => null),
    ]);
    const destinatarios = [...new Set(
      [tramite.creado_por_id, revisorId, finalizadorId]
        .filter((uid): uid is number => !!uid && uid !== user.id),
    )];
    for (const uid of destinatarios) {
      notifyTramite({
        recipient_id: uid,
        event:        'TRAMITE_NUEVO_COMENTARIO',
        title:        'Nuevo comentario en trámite',
        body:         `${user.nombre} comentó en el trámite ${tramite.folio}`,
        tramite_id:   id,
        folio:        tramite.folio,
      }).catch(() => {});
    }

    res.status(201).json({
      data: { ...comentario, autor_nombre: user.nombre },
      message: 'Comentario agregado',
    });
  } catch (err) { next(err); }
}

// ── GET /tramites/:id/comentarios ─────────────────────────────

export async function listarComentarios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);

    const tramiteRole = await getUserTramiteRole(user);
    if (!tramiteRole) throw new AppError('No tienes acceso a este módulo', 403);

    const tramite = await db('tramites').where({ id }).first();
    if (!tramite) throw new AppError('Trámite no encontrado', 404);

    if (tramiteRole === 'creador' && tramite.unidad_creadora_id !== user.oficina_id) {
      throw new AppError('No tienes acceso a este trámite', 403);
    }

    const comentarios = await db('comentarios_tramite as c')
      .join('usuarios as u', 'u.id', 'c.autor_id')
      .select('c.id', 'c.tramite_id', 'c.contenido', 'c.creado_en', 'u.id as autor_id', 'u.nombre as autor_nombre')
      .where('c.tramite_id', id)
      .orderBy('c.creado_en', 'asc');

    res.json({ data: comentarios });
  } catch (err) { next(err); }
}
