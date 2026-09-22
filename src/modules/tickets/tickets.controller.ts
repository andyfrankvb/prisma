/**
 * Controller: Tickets
 * File: src/modules/tickets/tickets.controller.ts
 *
 * Capa HTTP delgada: parsea y valida `Request`/`Response` de Express y
 * delega la lógica de negocio/persistencia a services/ticket-api.service.ts.
 *
 * Migrado desde SID (backend/app/Http/Controllers/TicketController.php).
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET    /tickets                          → listado (filtros + paginado, con visibilidad por usuario)
 *  POST   /tickets                          → crear ticket (+ adjuntos)
 *  GET    /tickets/:id                      → detalle (ticket + adjuntos + historial)
 *  PUT    /tickets/:id                      → actualizar (solo Mesa de Control de Tickets)
 *  GET    /tickets/:id/archivos/:fileId/descarga → descargar un adjunto
 *  GET    /tickets/opciones/:catalogo       → catálogos estáticos para el formulario
 *
 * Nota: SID exponía además `DELETE /tickets/:id` (Ticket@destroy) — no está
 * enrutado aquí a propósito, por decisión explícita al migrar.
 */

import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs   from 'fs';
import { AppError } from '../../utils/AppError';
import * as ticketApi from './services/ticket-api.service';
import {
  TIPOS_TICKET, ESTADOS_TICKET, URGENCIAS_TICKET, PRIORIDADES_TICKET, IMPACTOS_TICKET,
  CATEGORIAS_TICKET, TipoTicket, EstadoTicket, UrgenciaTicket, CategoriaTicket,
  CrearTicketPayload, ActualizarTicketPayload, FiltrosTicket,
} from './dtos/ticket.dto';

function requireUser(req: Request) {
  if (!req.user) throw new AppError('No autenticado', 401);
  return req.user;
}

function stringRequerido(valor: unknown, campo: string, maxLen: number): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new AppError(`${campo} es obligatorio`, 422);
  const texto = valor.trim();
  if (texto.length > maxLen) throw new AppError(`${campo} no puede exceder ${maxLen} caracteres`, 422);
  return texto;
}

function catalogoValido<T extends string>(valor: unknown, campo: string, catalogo: readonly T[]): T {
  if (typeof valor !== 'string' || !(catalogo as readonly string[]).includes(valor)) {
    throw new AppError(`${campo} inválido`, 422);
  }
  return valor as T;
}

function catalogoOpcional<T extends string>(valor: unknown, campo: string, catalogo: readonly T[]): T | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  return catalogoValido(valor, campo, catalogo);
}

function enteroOpcional(valor: unknown): number | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new AppError('destinatario_id debe ser un número entero', 422);
  return n;
}

function archivosDe(req: Request): Express.Multer.File[] {
  if (!req.files) return [];
  return Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
}

// ── GET /tickets ──────────────────────────────────────────────────────────────

export async function listarTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    const filtros: FiltrosTicket = {
      estado:    catalogoOpcional(req.query.estado, 'estado', ESTADOS_TICKET),
      categoria: catalogoOpcional(req.query.categoria, 'categoria', CATEGORIAS_TICKET.map((c) => c.value)),
      search:    typeof req.query.search === 'string' ? req.query.search.trim() || undefined : undefined,
      page:      req.query.page  ? Number(req.query.page)  : undefined,
      limit:     req.query.limit ? Number(req.query.limit) : undefined,
    };
    const resultado = await ticketApi.listarTickets(user, filtros);
    res.json(resultado);
  } catch (err) { next(err); }
}

// ── GET /tickets/:id ──────────────────────────────────────────────────────────

export async function obtenerTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) throw new AppError('Id de ticket inválido', 400);
    const data = await ticketApi.obtenerTicketDetalle(user, id);
    res.json({ data });
  } catch (err) { next(err); }
}

// ── POST /tickets ─────────────────────────────────────────────────────────────

export async function crearTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    const payload: CrearTicketPayload = {
      titulo:          stringRequerido(req.body.titulo, 'titulo', 255),
      descripcion:     stringRequerido(req.body.descripcion, 'descripcion', 10_000),
      tipo:            catalogoValido<TipoTicket>(req.body.tipo, 'tipo', TIPOS_TICKET),
      urgencia:        catalogoValido<UrgenciaTicket>(req.body.urgencia, 'urgencia', URGENCIAS_TICKET),
      categoria:       catalogoOpcional<CategoriaTicket>(req.body.categoria, 'categoria', CATEGORIAS_TICKET.map((c) => c.value)) ?? null,
      destinatario_id: enteroOpcional(req.body.destinatario_id) ?? null,
    };
    const data = await ticketApi.crearTicket(user, payload, archivosDe(req));
    res.status(201).json({ data, message: 'Ticket creado correctamente' });
  } catch (err) { next(err); }
}

// ── PUT /tickets/:id ──────────────────────────────────────────────────────────

export async function actualizarTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) throw new AppError('Id de ticket inválido', 400);

    const payload: ActualizarTicketPayload = {};
    if (req.body.titulo !== undefined)      payload.titulo = stringRequerido(req.body.titulo, 'titulo', 255);
    if (req.body.descripcion !== undefined) payload.descripcion = stringRequerido(req.body.descripcion, 'descripcion', 10_000);
    if (req.body.estado !== undefined)      payload.estado = catalogoValido<EstadoTicket>(req.body.estado, 'estado', ESTADOS_TICKET);
    if (req.body.urgencia !== undefined)    payload.urgencia = catalogoValido<UrgenciaTicket>(req.body.urgencia, 'urgencia', URGENCIAS_TICKET);
    if (req.body.categoria !== undefined)   payload.categoria = catalogoOpcional<CategoriaTicket>(req.body.categoria, 'categoria', CATEGORIAS_TICKET.map((c) => c.value)) ?? null;
    if (req.body.destinatario_id !== undefined) payload.destinatario_id = enteroOpcional(req.body.destinatario_id) ?? null;
    if (req.body.solucion !== undefined)    payload.solucion = String(req.body.solucion);

    const data = await ticketApi.actualizarTicket(user, id, payload, archivosDe(req));
    res.json({ data, message: 'Ticket actualizado correctamente' });
  } catch (err) { next(err); }
}

// ── GET /tickets/:id/archivos/:fileId/descarga ───────────────────────────────

export async function descargarArchivo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user   = requireUser(req);
    const id     = parseInt(req.params.id, 10);
    const fileId = parseInt(req.params.fileId, 10);
    if (!Number.isInteger(id) || !Number.isInteger(fileId)) throw new AppError('Id inválido', 400);

    const { file_path, original_name } = await ticketApi.obtenerArchivoParaDescarga(user, id, fileId);

    const STORAGE_BASE = process.env.STORAGE_LOCAL_PATH ?? path.join(process.cwd(), 'storage');
    const relative = file_path.startsWith('/') ? file_path.slice(1) : file_path;
    const absolute = path.resolve(path.join(STORAGE_BASE, relative));

    if (!absolute.startsWith(path.resolve(STORAGE_BASE)) || !fs.existsSync(absolute)) {
      throw new AppError('Archivo no encontrado en el servidor', 404);
    }

    res.setHeader('Content-Disposition', `attachment; filename="${original_name.replace(/"/g, '')}"`);
    fs.createReadStream(absolute).pipe(res);
  } catch (err) { next(err); }
}

// ── GET /tickets/destinatarios ────────────────────────────────────────────────

export async function listarDestinatarios(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    const data = await ticketApi.listarDestinatariosDisponibles(user);
    res.json({ data });
  } catch (err) { next(err); }
}

// ── GET /tickets/opciones/:catalogo ──────────────────────────────────────────

const CATALOGOS_TICKET: Record<string, unknown> = {
  tipos:        TIPOS_TICKET.map((value) => ({ value })),
  estados:      ESTADOS_TICKET.map((value) => ({ value })),
  prioridades:  PRIORIDADES_TICKET.map((value) => ({ value })),
  urgencias:    URGENCIAS_TICKET.map((value) => ({ value })),
  impactos:     IMPACTOS_TICKET.map((value) => ({ value })),
  categorias:   CATEGORIAS_TICKET,
};

export async function obtenerCatalogo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const clave = req.params.catalogo;
    const data = CATALOGOS_TICKET[clave];
    if (!data) throw new AppError('Catálogo no encontrado', 404);
    res.json({ data });
  } catch (err) { next(err); }
}
