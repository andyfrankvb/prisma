/**
 * Dispatcher: Notification Service
 * File: src/notifications/notification.dispatcher.ts
 *
 * Resolves recipients for each event type, renders the correct template,
 * and fans out to all configured channels (email + in-app).
 *
 * This is the single entry point used by both the scheduler and
 * the event-driven triggers (e.g. status change hooks).
 */

import { db }          from '../db';
import { sendEmail }   from './channels/email.channel';
import { sendInApp }   from './channels/inapp.channel';
import { renderTemplate } from './templates';
import { logger }      from '../utils/logger';
import { getActorFlujo } from '../services/flujo-config.service';
import type {
  NotificationPayload,
  RecipientInfo,
  NotificationEventType,
} from './notification.types';

// ── Recipient resolvers ───────────────────────────────────────────────────────

/**
 * For deadline alerts: notify the assigned abogado(s) + the encargado of the
 * oficina that registered the oficio.
 */
async function resolveDeadlineRecipients(oficio_id: number): Promise<RecipientInfo[]> {
  // Assigned lawyers
  const abogados: RecipientInfo[] = await db('asignaciones_juridicas as aj')
    .join('usuarios as u', 'u.id', 'aj.abogado_id')
    .where('aj.oficio_id', oficio_id)
    .select('u.id as user_id', 'u.nombre', 'u.email', 'u.unidad_id as oficina_id');

  // Encargado(s) of the registering oficina
  const encargados: RecipientInfo[] = await db('oficios as o')
    .join('usuarios as u', (join) =>
      join
        .on('u.unidad_id', 'o.unidad_registro_id')
        .andOnVal('u.rol', 'ENCARGADO'),
    )
    .where('o.id', oficio_id)
    .select('u.id as user_id', 'u.nombre', 'u.email', 'u.unidad_id as oficina_id');

  // Deduplicate by user_id
  const seen = new Set<number>();
  return [...abogados, ...encargados].filter((r) => {
    if (seen.has(r.user_id)) return false;
    seen.add(r.user_id);
    return true;
  });
}

/**
 * Aviso de visto bueno: va a quien sube el documento firmado, o sea la secretaría.
 *
 * Se resuelve de la configuración de flujos y no del nombre de la unidad: el
 * SuperAdmin puede cambiar quién ocupa ese puesto y el aviso debe seguir al puesto,
 * no a la persona. Como respaldo, si nadie está configurado, se toma a quien tenga
 * el rol de cuenta SECRETARIA en la Dirección General.
 */
async function resolveVoboRecipients(_oficio_id: number): Promise<RecipientInfo[]> {
  const configuradas = await db('configuracion_flujos as cf')
    .join('usuarios as u', 'u.id', 'cf.usuario_id')
    .where({ 'cf.modulo_clave': 'oficialia_partes', 'cf.rol_flujo': 'SECRETARIA' })
    .andWhere('u.activo', true)
    .select('u.id as user_id', 'u.nombre', 'u.email', 'u.unidad_id as oficina_id');
  if (configuradas.length) return configuradas;

  return db('usuarios as u')
    .join('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
    .where('u.rol', 'SECRETARIA')
    .andWhere('u.activo', true)
    .andWhere('cu.tipo', 'DIRECCION_GENERAL')
    .select('u.id as user_id', 'u.nombre', 'u.email', 'u.unidad_id as oficina_id');
}

async function resolveRecipients(
  event:     NotificationEventType,
  oficio_id: number,
): Promise<RecipientInfo[]> {
  switch (event) {
    case 'DEADLINE_1_DAY':
    case 'DEADLINE_OVERDUE':
      return resolveDeadlineRecipients(oficio_id);
    case 'VOBO_APROBADO':
      return resolveVoboRecipients(oficio_id);
    default:
      return [];
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function dispatch(payload: NotificationPayload): Promise<void> {
  const recipients = payload.recipients?.length
    ? payload.recipients
    : await resolveRecipients(payload.event, payload.oficio_id);

  if (recipients.length === 0) {
    logger.warn({ event: payload.event, oficio_id: payload.oficio_id }, 'No recipients found for notification');
    return;
  }

  // Fan out to each recipient
  await Promise.allSettled(
    recipients.map(async (recipient) => {
      const tpl = renderTemplate(payload.event, {
        folio:               payload.folio,
        dependencia_origen:  payload.dependencia_origen,
        fecha_vencimiento:   payload.fecha_vencimiento,
        nombre_destinatario: recipient.nombre,
        // Se pasan también los campos de tareas y delegatorios: sin ellos las
        // plantillas que los usan salían con textos genéricos.
        tarea_titulo:        payload.tarea_titulo,
        evento_titulo:       payload.evento_titulo,
        autor_nombre:        payload.autor_nombre,
        delegatorio_area:    payload.delegatorio_area,
        delegatorio_nota:    payload.delegatorio_nota,
      });

      // ── Email ──────────────────────────────────────────────
      await sendEmail({
        to:      recipient.email,
        subject: tpl.subject,
        html:    tpl.html,
        text:    tpl.text,
      }).catch((err) =>
        logger.error({ err, user_id: recipient.user_id, event: payload.event }, 'Email notification failed'),
      );

      await sendInApp({
        user_id:    recipient.user_id,
        type:       payload.event,
        title:      tpl.inAppTitle,
        body:       tpl.inAppBody,
        oficio_id:  payload.oficio_id,
        folio:      payload.folio,
        read:       false,
        created_at: new Date(),
      }).catch((err) =>
        logger.error({ err, user_id: recipient.user_id, event: payload.event }, 'InApp notification failed'),
      );
    }),
  );
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

/** Called by the scheduler for deadline checks */
export async function notifyDeadline1Day(oficio: {
  id: number; folio: string; dependencia_origen: string; fecha_vencimiento: string;
}): Promise<void> {
  await dispatch({
    event:              'DEADLINE_1_DAY',
    oficio_id:          oficio.id,
    folio:              oficio.folio,
    dependencia_origen: oficio.dependencia_origen,
    fecha_vencimiento:  oficio.fecha_vencimiento,
  });
}

export async function notifyDeadlineOverdue(oficio: {
  id: number; folio: string; dependencia_origen: string; fecha_vencimiento: string;
}): Promise<void> {
  await dispatch({
    event:              'DEADLINE_OVERDUE',
    oficio_id:          oficio.id,
    folio:              oficio.folio,
    dependencia_origen: oficio.dependencia_origen,
    fecha_vencimiento:  oficio.fecha_vencimiento,
  });
}

/** Called by the controller after VOBO_APROBADO status change */
export async function notifyVoboAprobado(oficio: {
  id: number; folio: string; dependencia_origen: string;
}): Promise<void> {
  await dispatch({
    event:              'VOBO_APROBADO',
    oficio_id:          oficio.id,
    folio:              oficio.folio,
    dependencia_origen: oficio.dependencia_origen,
  });
}

// ── Notificaciones de Eventos/Tareas ─────────────────────────────────────────

/**
 * Envía notificación in-app directamente a un usuario específico.
 * Usado para notificaciones de eventos/tareas donde el destinatario
 * ya está resuelto por el controller.
 */
export async function notifyEventoTarea(payload: {
  recipient_id:   number;
  event:          import('./notification.types').NotificationEventType;
  title:          string;
  body:           string;
  tarea_id:       number;
  evento_titulo:  string;
}): Promise<void> {
  await sendInApp({
    user_id:       payload.recipient_id,
    type:          payload.event,
    title:         payload.title,
    body:          payload.body,
    tarea_id:      payload.tarea_id,
    evento_titulo: payload.evento_titulo,
    read:          false,
    created_at:    new Date(),
  }).catch((err) =>
    logger.error({ err, ...payload }, 'notifyEventoTarea failed'),
  );
}

// ── Notificaciones de Trámites ────────────────────────────────────────────────

/**
 * Resuelve el destinatario para TRAMITE_DEVUELTO_JURIDICO:
 * usa la configuración de flujo para obtener el revisor.
 */
async function resolveRevisorJuridico(): Promise<{ user_id: number } | null> {
  try {
    const revisorId = await getActorFlujo('tramites_seguimiento', 'REVISOR');
    return { user_id: revisorId };
  } catch {
    // Fallback: buscar por unidad_id=36 si no hay configuración
    const revisor = await db('usuarios')
      .where('unidad_id', 36)
      .select('id as user_id')
      .first();
    return revisor ?? null;
  }
}

export async function notifyTramite(payload: {
  recipient_id?: number;
  event:         import('./notification.types').NotificationEventType;
  title:         string;
  body:          string;
  tramite_id:    number;
  folio:         string;
  /** Requerido para TRAMITE_DEVUELTO_DELEGADO: id del creador del trámite */
  creador_id?:   number;
}): Promise<void> {
  let recipient_id = payload.recipient_id;

  // Para TRAMITE_DEVUELTO_JURIDICO, el destinatario es el revisor (unidad_id=36)
  if (payload.event === 'TRAMITE_DEVUELTO_JURIDICO' && !recipient_id) {
    const revisor = await resolveRevisorJuridico();
    if (!revisor) {
      logger.warn({ event: payload.event, tramite_id: payload.tramite_id }, 'No se encontró revisor jurídico (unidad_id=36)');
      return;
    }
    recipient_id = revisor.user_id;
  }

  // Para TRAMITE_DEVUELTO_DELEGADO, el destinatario es el creador del trámite
  if (payload.event === 'TRAMITE_DEVUELTO_DELEGADO') {
    recipient_id = payload.creador_id ?? payload.recipient_id;
    if (!recipient_id) {
      logger.warn({ event: payload.event, tramite_id: payload.tramite_id }, 'No se proporcionó creador_id para TRAMITE_DEVUELTO_DELEGADO');
      return;
    }
  }

  if (!recipient_id) {
    logger.warn({ event: payload.event, tramite_id: payload.tramite_id }, 'No se pudo resolver destinatario para notifyTramite');
    return;
  }

  await sendInApp({
    user_id:    recipient_id,
    type:       payload.event,
    title:      payload.title,
    body:       payload.body,
    tramite_id: payload.tramite_id,
    folio:      payload.folio,
    read:       false,
    created_at: new Date(),
  }).catch((err) =>
    logger.error({ err, ...payload }, 'notifyTramite failed'),
  );
}

/**
 * Notificación de un delegatorio —o de un oficio turnado, que comparte la misma
 * estructura: un aviso dirigido a personas concretas de un área. A diferencia de las de oficios, aquí los
 * destinatarios siempre se indican explícitamente: el delegatorio va dirigido a
 * una persona concreta (el encargado del área, quien lo trabaja o quien lo detonó),
 * no a todos los actores de un rol.
 */
export async function notifyDelegatorio(payload: {
  event: 'DELEGATORIO_NUEVO' | 'DELEGATORIO_ASIGNADO' | 'DELEGATORIO_EN_REVISION'
       | 'DELEGATORIO_CONTESTADO' | 'DELEGATORIO_DEVUELTO' | 'OFICIO_TURNADO'
       | 'PASE_FIRMA_ENVIADO' | 'PASE_FIRMA_FIRMADO' | 'PASE_FIRMA_DEVUELTO';
  usuarioIds: number[];
  oficio_id:  number;
  folio:      string;
  dependencia_origen?: string;
  area?: string;
  nota?: string;
}): Promise<void> {
  const ids = [...new Set(payload.usuarioIds.filter(Boolean))];
  if (!ids.length) return;

  const recipients = await db('usuarios')
    .whereIn('id', ids)
    .andWhere('activo', true)
    .select('id as user_id', 'nombre', 'email', 'unidad_id as oficina_id');
  if (!recipients.length) return;

  await dispatch({
    event:              payload.event,
    oficio_id:          payload.oficio_id,
    folio:              payload.folio,
    dependencia_origen: payload.dependencia_origen,
    delegatorio_area:   payload.area,
    delegatorio_nota:   payload.nota,
    recipients:         recipients as any,
  });
}
