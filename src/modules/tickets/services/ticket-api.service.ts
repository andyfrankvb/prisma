/**
 * Service: Tickets
 * File: src/modules/tickets/services/ticket-api.service.ts
 *
 * Capa de negocio/persistencia, desacoplada del transporte HTTP — el
 * controller (tickets.controller.ts) parsea/valida `Request`/`Response` y
 * delega aquí con DTOs ya tipados.
 *
 * Migrado desde SID (backend/app/Http/Controllers/TicketController.php,
 * backend/app/Models/Ticket.php, TicketFile.php).
 *
 * Modelo de permisos (nuevo — SID no tiene equivalente 1 a 1):
 * SID gestiona la mesa de ayuda con roles numéricos propios de su tabla
 * `roles` (rol_id=11 "Mesa de Control", rol_id=6 "Director", etc.) que no
 * existen en el modelo de identidad único de PRISMA (usuarios.rol +
 * catalogo_unidades). En vez de forzar ese mapeo, se creó una unidad propia
 * ("Mesa de Control de Tickets", clave MESA_CONTROL_TICKETS — ver migración
 * 2026-09-20_tickets.sql) y quien la gestiona es SUPERADMIN o un
 * DIRECTOR/OPERATIVO de esa unidad — mismo patrón que `getUserTramiteRole`
 * resuelve "Director Jurídico" como DIRECTOR de unidad_id=36.
 *
 * Reglas de visibilidad de listado (generaliza lo que SID limitaba a
 * rol_id=3): cualquier usuario que no gestiona tickets ve los suyos
 * (remitente o destinatario) más cualquiera cuyo folio contenga "T2".
 *
 * Reglas de edición: SID solo bloqueaba el modal de edición en el
 * frontend (Angular) para quien no tuviera rol permitido — el backend
 * aceptaba la misma petición de cualquiera. Aquí el permiso se aplica
 * también en el servidor: cualquiera puede crear y ver sus tickets, pero
 * solo quien gestiona tickets puede actualizarlos (cambiar estado, título,
 * descripción, etc.).
 */

import { db }       from '../../../db';
import { AppError } from '../../../utils/AppError';
import { storage }  from '../../../services/storage.service';
import { notifyTicket } from '../../../notifications/notification.dispatcher';
import type { AuthUser } from '../../oficialia_partes/oficios.types';
import {
  Ticket, TicketDetalle, FiltrosTicket, CrearTicketPayload, ActualizarTicketPayload,
  TicketListResponse, ActorTicket, HistorialTicketEntry, CambioCampoTicket, AdjuntoTicket,
  EstadoTicket, ESTADOS_CON_SOLUCION,
} from '../dtos/ticket.dto';

const MESA_CONTROL_CLAVE = 'MESA_CONTROL_TICKETS';
const PER_PAGE_DEFAULT   = 20;
const PER_PAGE_MAX       = 100;

// Campos que se auditan en `change_log` — igual selección que el legacy
// (`Ticket@update: $original = $ticket->only([...])`).
const CAMPOS_AUDITABLES = [
  'titulo', 'descripcion', 'tipo', 'estado', 'urgencia', 'categoria',
  'destinatario_id', 'solucion', 'fecha_solucion',
] as const;

// ── Unidad Mesa de Control ──────────────────────────────────────────────────

async function getMesaControlUnidad(): Promise<{ id: number; nombre: string }> {
  const unidad = await db('catalogo_unidades')
    .where({ clave: MESA_CONTROL_CLAVE })
    .select('id', 'nombre')
    .first();
  if (!unidad) {
    throw new AppError('No está configurada la unidad "Mesa de Control de Tickets"', 500);
  }
  return unidad;
}

/** SUPERADMIN, o DIRECTOR/OPERATIVO de la unidad Mesa de Control de Tickets. */
async function esGestorDeTickets(user: AuthUser): Promise<boolean> {
  if (user.rol === 'SUPERADMIN') return true;
  if (user.rol !== 'DIRECTOR' && user.rol !== 'OPERATIVO') return false;
  const mesaControl = await getMesaControlUnidad();
  return user.unidad_id === mesaControl.id;
}

// ── Folio (ticket_code) ──────────────────────────────────────────────────────

/**
 * Folio YYMM + secuencia de 3 dígitos reiniciada cada mes. El UPSERT es
 * atómico en Postgres sin necesitar un `SELECT ... FOR UPDATE` explícito —
 * a diferencia de SID, que calculaba `nu_ticket` y `ticket_code` con dos
 * SELECTs separados dentro de la misma transacción (condición de carrera
 * real bajo concurrencia).
 */
async function siguienteTicketCode(trx: import('knex').Knex.Transaction): Promise<string> {
  const yymm = new Date().toISOString().slice(2, 7).replace('-', '');
  const [{ seq }] = await trx('ticket_code_counters')
    .insert({ yymm, seq: 1 })
    .onConflict('yymm')
    .merge({ seq: trx.raw('ticket_code_counters.seq + 1') })
    .returning('seq');
  return `${yymm}${String(seq).padStart(3, '0')}`;
}

// ── Actor (para `change_log` y `last_actor`) ─────────────────────────────────

async function buildActor(userId: number): Promise<ActorTicket> {
  const u = await db('usuarios as u')
    .join('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
    .where('u.id', userId)
    .select('u.id', 'u.nombre', 'u.email', 'u.rol', 'u.unidad_id', 'cu.nombre as unidad_nombre')
    .first();
  if (!u) throw new AppError('El usuario proporcionado no existe.', 422);
  return {
    id: u.id, nombre: u.nombre, email: u.email, rol: u.rol,
    unidad_id: u.unidad_id, unidad_nombre: u.unidad_nombre,
  };
}

// ── Selección / mapeo de filas ───────────────────────────────────────────────

function selectTicketBase(query: import('knex').Knex.QueryBuilder) {
  // LEFT JOIN (no INNER): varios de los 13,760 tickets históricos migrados
  // de SID tienen remitente_id/destinatario_id en NULL porque esa persona
  // todavía no tiene cuenta en PRISMA — un INNER JOIN los haría desaparecer
  // en silencio de todo listado/detalle. El nombre cae a *_legacy_nombre.
  return query
    .leftJoin('usuarios as remitente', 'remitente.id', 't.remitente_id')
    .leftJoin('catalogo_unidades as cu_remitente', 'cu_remitente.id', 'remitente.unidad_id')
    .leftJoin('usuarios as destinatario', 'destinatario.id', 't.destinatario_id')
    .select(
      't.id', 't.ticket_code', 't.titulo', 't.descripcion', 't.tipo', 't.estado',
      't.urgencia', 't.prioridad', 't.impacto', 't.categoria', 't.categoria_legacy',
      't.remitente_id',
      db.raw("COALESCE(remitente.nombre, t.remitente_legacy_nombre, 'Usuario de SID (sin cuenta)') as remitente_nombre"),
      'remitente.unidad_id as remitente_unidad_id', 'cu_remitente.nombre as remitente_unidad_nombre',
      't.destinatario_id',
      db.raw('COALESCE(destinatario.nombre, t.destinatario_legacy_nombre) as destinatario_nombre'),
      't.solucion', 't.fecha_solucion', 't.last_action', 't.created_at', 't.updated_at',
    );
}

/** Visibilidad de listado: quien gestiona ve todo; el resto, lo suyo + folios "T2". */
function aplicarVisibilidad(
  query: import('knex').Knex.QueryBuilder,
  user: AuthUser,
  esGestor: boolean,
) {
  if (esGestor) return query;
  return query.where((qq) => {
    qq.where('t.remitente_id', user.id)
      .orWhere('t.destinatario_id', user.id)
      .orWhereILike('t.ticket_code', '%T2%');
  });
}

// ── Listado ───────────────────────────────────────────────────────────────────

export async function listarTickets(user: AuthUser, filtros: FiltrosTicket): Promise<TicketListResponse> {
  const esGestor = await esGestorDeTickets(user);
  const page  = Math.max(1, filtros.page ?? 1);
  const limit = Math.min(PER_PAGE_MAX, Math.max(1, filtros.limit ?? PER_PAGE_DEFAULT));

  let query = selectTicketBase(db('tickets as t')).orderBy('t.id', 'desc');
  query = aplicarVisibilidad(query, user, esGestor);

  if (filtros.estado)    query = query.andWhere('t.estado', filtros.estado);
  if (filtros.categoria) query = query.andWhere('t.categoria', filtros.categoria);
  if (filtros.search) {
    const term = `%${filtros.search}%`;
    query = query.andWhere((qq) => {
      qq.whereILike('t.ticket_code', term)
        .orWhereILike('t.titulo', term)
        .orWhereILike('t.descripcion', term);
    });
  }

  const [{ count }] = await query.clone().clearSelect().clearOrder()
    .select(db.raw('COUNT(*) as count')) as any[];

  const data = await query.limit(limit).offset((page - 1) * limit) as Ticket[];

  return { data, meta: { total: Number(count), page, limit, puede_gestionar: esGestor } };
}

// ── Detalle ───────────────────────────────────────────────────────────────────

async function cargarDetalle(ticketId: number): Promise<TicketDetalle> {
  // `.select()` en Knex se acumula entre llamadas: esto agrega `change_log`
  // a las columnas de `selectTicketBase` sin un segundo roundtrip.
  const row = await selectTicketBase(db('tickets as t'))
    .select('t.change_log')
    .where('t.id', ticketId)
    .first();

  if (!row) throw new AppError('Ticket no encontrado', 404);

  const archivos: AdjuntoTicket[] = await db('ticket_archivos')
    .where({ ticket_id: ticketId })
    .orderBy('id', 'asc');

  const change_log: HistorialTicketEntry[] = Array.isArray(row.change_log) ? row.change_log : [];

  const { change_log: _omit, ...ticket_fields } = row;
  return { ...(ticket_fields as Ticket), change_log, archivos };
}

function puedeVerTicket(user: AuthUser, ticket: Ticket, esGestor: boolean): boolean {
  if (esGestor) return true;
  if (ticket.remitente_id === user.id) return true;
  if (ticket.destinatario_id === user.id) return true;
  if (ticket.ticket_code.toUpperCase().includes('T2')) return true;
  return false;
}

export async function obtenerTicketDetalle(user: AuthUser, ticketId: number): Promise<TicketDetalle> {
  const esGestor = await esGestorDeTickets(user);
  const detalle  = await cargarDetalle(ticketId);
  if (!puedeVerTicket(user, detalle, esGestor)) {
    throw new AppError('No tienes acceso a este ticket', 403);
  }
  return detalle;
}

// ── Crear ─────────────────────────────────────────────────────────────────────

async function resolverDestino(
  user: AuthUser,
  destinatarioIdSolicitado: number | null | undefined,
): Promise<number | null> {
  const mesaControl = await getMesaControlUnidad();

  if (user.unidad_id === mesaControl.id) {
    // El propio personal de la mesa de control puede dirigir el ticket a
    // cualquier usuario activo (o dejarlo sin asignar).
    if (!destinatarioIdSolicitado) return null;
    const existe = await db('usuarios').where({ id: destinatarioIdSolicitado, activo: true }).first();
    if (!existe) throw new AppError('El destinatario proporcionado no existe.', 422);
    return destinatarioIdSolicitado;
  }

  // Cualquier otra unidad: el ticket siempre se dirige a la Mesa de Control
  // de Tickets (igual que SID forzaba "oficina 1" para las oficinas 2, 3 y 4
  // — aquí generalizado a todos). Si se sugiere un destinatario, debe
  // pertenecer a esa unidad.
  if (destinatarioIdSolicitado) {
    const pertenece = await db('usuarios')
      .where({ id: destinatarioIdSolicitado, unidad_id: mesaControl.id, activo: true })
      .first();
    if (!pertenece) {
      throw new AppError('El destinatario debe pertenecer a la Mesa de Control de Tickets.', 422);
    }
    return destinatarioIdSolicitado;
  }
  return null;
}

/**
 * Usuarios a los que se puede dirigir un ticket nuevo: mismo criterio que
 * `resolverDestino`, expuesto para poblar el selector del formulario
 * (equivalente a `obtenerUsuariosDeOficina` del legacy).
 */
export async function listarDestinatariosDisponibles(
  user: AuthUser,
): Promise<{ id: number; nombre: string }[]> {
  const mesaControl = await getMesaControlUnidad();
  const query = db('usuarios').where({ activo: true }).select('id', 'nombre').orderBy('nombre', 'asc');
  if (user.unidad_id !== mesaControl.id) query.andWhere('unidad_id', mesaControl.id);
  return query;
}

export async function crearTicket(
  user: AuthUser,
  payload: CrearTicketPayload,
  archivos: Express.Multer.File[],
): Promise<TicketDetalle> {
  const existeHoy = await db('tickets')
    .where({ remitente_id: user.id, titulo: payload.titulo })
    .whereRaw('created_at::date = current_date')
    .first();
  if (existeHoy) {
    throw new AppError('Ya existe un ticket con el mismo título hoy.', 409);
  }

  const destinatario_id = await resolverDestino(user, payload.destinatario_id);
  const actor = await buildActor(user.id);

  const ticketId = await db.transaction(async (trx) => {
    const ticket_code = await siguienteTicketCode(trx);

    const [{ id }] = await trx('tickets')
      .insert({
        ticket_code,
        titulo:            payload.titulo,
        descripcion:       payload.descripcion,
        tipo:              payload.tipo,
        estado:            'NUEVO',
        urgencia:          payload.urgencia,
        categoria:         payload.categoria ?? null,
        remitente_id:      user.id,
        destinatario_id,
        last_action:       'CREATE',
        last_modified_by:  user.id,
      })
      .returning('id');

    for (const file of archivos) {
      const saved = await storage.save(file, 'tickets', {});
      await trx('ticket_archivos').insert({
        ticket_id:     id,
        file_path:     saved,
        original_name: file.originalname,
        file_size:     file.size,
        file_type:     file.mimetype,
      });
    }

    return id as number;
  });

  if (destinatario_id) {
    const ticket = await cargarDetalle(ticketId);
    await notifyTicket({
      recipient_id: destinatario_id,
      ticket_id:    ticketId,
      ticket_code:  ticket.ticket_code,
      titulo:       ticket.titulo,
      actor_nombre: actor.nombre,
    });
  }

  return cargarDetalle(ticketId);
}

// ── Actualizar ────────────────────────────────────────────────────────────────

function accionDesde(cambios: Set<string>, estadoAnterior: EstadoTicket, estadoNuevo: EstadoTicket): string {
  if (cambios.has('estado') && estadoAnterior !== estadoNuevo) {
    return estadoNuevo === 'CERRADO' ? 'CERRAR_TICKET' : 'CAMBIO_ESTADO';
  }
  if (cambios.has('solucion'))    return 'REGISTRAR_AVANCE';
  if (cambios.has('descripcion')) return 'EDITAR_DESCRIPCION';
  if (cambios.has('titulo'))      return 'EDITAR_TITULO';
  if (cambios.has('urgencia'))    return 'CAMBIO_URGENCIA';
  if (cambios.has('categoria'))   return 'CAMBIO_CATEGORIA';
  return 'UPDATE';
}

export async function actualizarTicket(
  user: AuthUser,
  ticketId: number,
  payload: ActualizarTicketPayload,
  archivos: Express.Multer.File[],
): Promise<TicketDetalle> {
  const esGestor = await esGestorDeTickets(user);
  if (!esGestor) {
    throw new AppError('Solo la Mesa de Control de Tickets puede actualizar un ticket.', 403);
  }

  const ticket = await db('tickets').where({ id: ticketId }).first();
  if (!ticket) throw new AppError('El ticket no existe.', 404);

  if (['CERRADO', 'RESUELTO'].includes(ticket.estado)) {
    throw new AppError('No se puede actualizar un ticket cerrado o resuelto.', 403);
  }

  const nuevoEstado: EstadoTicket = payload.estado ?? ticket.estado;
  const permiteSolucion = ESTADOS_CON_SOLUCION.includes(nuevoEstado);

  if (payload.solucion !== undefined && payload.solucion.trim() !== '' && !permiteSolucion) {
    throw new AppError('No se permite "solución" para el estado actual.', 422);
  }

  if (payload.estado !== undefined && nuevoEstado === 'CERRADO') {
    const sol = (payload.solucion ?? ticket.solucion ?? '').trim();
    if (sol.length < 5) {
      throw new AppError('Debe capturar "solución" (mín. 5 caracteres) al cerrar el ticket.', 422);
    }
  }

  const destinatario_id = payload.destinatario_id !== undefined
    ? await resolverDestino(user, payload.destinatario_id)
    : undefined;

  const actor = await buildActor(user.id);

  const original: Record<string, unknown> = {};
  for (const campo of CAMPOS_AUDITABLES) original[campo] = ticket[campo];

  const updates: Record<string, unknown> = {};
  if (payload.titulo !== undefined)      updates.titulo = payload.titulo;
  if (payload.descripcion !== undefined) updates.descripcion = payload.descripcion;
  if (payload.urgencia !== undefined)    updates.urgencia = payload.urgencia;
  if (payload.categoria !== undefined)   updates.categoria = payload.categoria;
  if (payload.estado !== undefined)      updates.estado = nuevoEstado;
  if (destinatario_id !== undefined)     updates.destinatario_id = destinatario_id;

  if (permiteSolucion && payload.solucion !== undefined) {
    updates.solucion = payload.solucion;
  }
  if (nuevoEstado === 'CERRADO') {
    updates.fecha_solucion = new Date();
  }

  const cambios = new Set(Object.keys(updates));
  updates.last_action      = accionDesde(cambios, ticket.estado, nuevoEstado);
  updates.last_modified_by = user.id;
  updates.updated_at       = new Date();

  await db.transaction(async (trx) => {
    await trx('tickets').where({ id: ticketId }).update(updates);

    const final: Record<string, unknown> = { ...original, ...updates };
    const diff: Record<string, CambioCampoTicket> = {};
    for (const campo of CAMPOS_AUDITABLES) {
      const oldVal = original[campo] ?? null;
      const newVal = final[campo] ?? null;
      if (String(oldVal) !== String(newVal)) diff[campo] = { old: oldVal, new: newVal };
    }

    if (Object.keys(diff).length > 0) {
      const entry: HistorialTicketEntry = {
        at: new Date().toISOString(),
        action: updates.last_action as string,
        user: actor,
        diff,
      };
      const log: HistorialTicketEntry[] = Array.isArray(ticket.change_log) ? ticket.change_log : [];
      log.push(entry);
      await trx('tickets').where({ id: ticketId }).update({ change_log: JSON.stringify(log) });
    }

    for (const file of archivos) {
      const saved = await storage.save(file, 'tickets', {});
      await trx('ticket_archivos').insert({
        ticket_id:     ticketId,
        file_path:     saved,
        original_name: file.originalname,
        file_size:     file.size,
        file_type:     file.mimetype,
      });
    }
  });

  return cargarDetalle(ticketId);
}

// ── Adjuntos ──────────────────────────────────────────────────────────────────

export async function obtenerArchivoParaDescarga(
  user: AuthUser,
  ticketId: number,
  fileId: number,
): Promise<{ file_path: string; original_name: string }> {
  const esGestor = await esGestorDeTickets(user);
  const ticket   = await cargarDetalle(ticketId);
  if (!puedeVerTicket(user, ticket, esGestor)) {
    throw new AppError('No tienes acceso a este ticket', 403);
  }

  const archivo = ticket.archivos.find((a) => a.id === fileId);
  if (!archivo) throw new AppError('Archivo no encontrado', 404);

  return { file_path: archivo.file_path, original_name: archivo.original_name };
}
