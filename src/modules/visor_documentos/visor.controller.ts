/**
 * Controller: Visor de Documentos
 * File: src/modules/visor_documentos/visor.controller.ts
 *
 * Capa HTTP delgada — parsea/valida `Request`/`Response`, delega a los
 * servicios en ./services/*.ts. Mismo idioma que tickets.controller.ts:
 * envoltura `{ data }` / `{ data, meta }`, errores vía `AppError`.
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET  /catalogos/delegaciones
 *  GET  /catalogos/secciones
 *  GET  /tomos?delegacion_id=&seccion_id=
 *  GET  /tomos/buscar?delegacion_id=&seccion_id=&numero_romano=
 *  GET  /tomos/:id/fojas
 *  POST /tomos/:id/merge-rango           { desde, hasta } → PDF binario
 *  GET  /fojas/:id
 *  GET  /fojas/:id/imagen?version=        → WebP binario (marca de agua según rol)
 *  GET  /fojas/:id/dictamen
 *  POST /fojas/:id/dictamen               (JURIDICO/ENCARGADO/DIRECTOR/SUPERADMIN)
 *  GET  /fojas/:id/transcripcion
 *  POST /fojas/:id/transcripcion          (genera con el motor OCR del proyecto)
 *  PUT  /fojas/:id/transcripcion
 */
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/AppError';
import { db }        from '../../db';
import type { AuthUser } from '../oficialia_partes/oficios.types';
import * as catalogoService     from './services/catalogo.service';
import * as tomosService        from './services/tomos.service';
import * as fojasService        from './services/fojas.service';
import * as imagenService       from './services/imagen.service';
import * as dictamenService     from './services/dictamen.service';
import * as transcripcionService from './services/transcripcion.service';
import * as mergeService        from './services/merge.service';
import * as inscripcionesService from './services/inscripciones.service';
import { esAdminEquivalente, puedeCurar } from './services/roles.service';

const MODULO_CLAVE = 'visor_documentos';

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new AppError('No autenticado', 401);
  return req.user;
}

/** Defensa en profundidad: /usuarios/mis-modulos ya filtra esto en el picker, se re-verifica aquí. */
async function requireModuloVisor(user: AuthUser): Promise<void> {
  if (user.rol === 'SUPERADMIN') return;
  const row = await db('usuario_modulos as um')
    .join('modulos as m', 'm.id', 'um.modulo_id')
    .where('um.usuario_id', user.id)
    .andWhere('m.clave', MODULO_CLAVE)
    .andWhere('m.activo', true)
    .first();
  if (!row) throw new AppError('Acceso restringido: "Visor de Documentos" no habilitado', 403);
}

function idDeParam(req: Request, nombre: string): number {
  const id = parseInt(req.params[nombre], 10);
  if (!Number.isInteger(id)) throw new AppError(`Id inválido: ${nombre}`, 400);
  return id;
}

function ipDeRequest(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  return typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket.remoteAddress || '0.0.0.0');
}

// ── Catálogos ─────────────────────────────────────────────────────────────────

export async function listarDelegaciones(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    res.json({ data: await catalogoService.listarDelegaciones() });
  } catch (err) { next(err); }
}

export async function listarSecciones(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    res.json({ data: await catalogoService.listarSecciones() });
  } catch (err) { next(err); }
}

// ── Tomos ─────────────────────────────────────────────────────────────────────

function enteroRequerido(valor: unknown, campo: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new AppError(`${campo} es obligatorio y debe ser un entero`, 422);
  return n;
}

export async function listarTomos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const delegacionId = enteroRequerido(req.query.delegacion_id, 'delegacion_id');
    const seccionId     = enteroRequerido(req.query.seccion_id, 'seccion_id');
    res.json({ data: await tomosService.listarTomos(delegacionId, seccionId) });
  } catch (err) { next(err); }
}

export async function buscarTomo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const delegacionId = enteroRequerido(req.query.delegacion_id, 'delegacion_id');
    const seccionId     = enteroRequerido(req.query.seccion_id, 'seccion_id');
    const numeroRomano  = typeof req.query.numero_romano === 'string' ? req.query.numero_romano.trim() : '';
    if (!numeroRomano) throw new AppError('numero_romano es obligatorio', 422);
    const data = await tomosService.buscarTomo(delegacionId, seccionId, numeroRomano);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function listarFojasDeTomo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const tomoId = idDeParam(req, 'id');
    res.json({ data: await tomosService.listarFojasDeTomo(tomoId) });
  } catch (err) { next(err); }
}

/** Tabla "Libros Disponibles" — equivalente a LibrosService.obtenerLibrosConParametros de SID. */
export async function listarLibros(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const delegacionId = enteroRequerido(req.query.delegacion_id, 'delegacion_id');
    const seccionId     = req.query.seccion_id !== undefined ? enteroRequerido(req.query.seccion_id, 'seccion_id') : undefined;
    const tomoQuery      = typeof req.query.tomo === 'string' ? req.query.tomo : undefined;
    res.json({ data: await tomosService.listarLibros(delegacionId, seccionId, tomoQuery) });
  } catch (err) { next(err); }
}

export async function mergeRango(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const tomoId = idDeParam(req, 'id');
    const desde  = enteroRequerido(req.body.desde, 'desde');
    const hasta  = enteroRequerido(req.body.hasta, 'hasta');

    const buffer = await mergeService.mergeRangoPdf(tomoId, desde, hasta);
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Length':      buffer.length.toString(),
      'Content-Disposition': `attachment; filename="tomo-${tomoId}-${desde}-${hasta}.pdf"`,
    });
    res.send(buffer);
  } catch (err) { next(err); }
}

// ── Inscripciones (modo de navegación paralelo al de tomo/página) ──────────────

export async function listarInscripcionesDeTomo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const tomoId = idDeParam(req, 'id');
    res.json({ data: await inscripcionesService.listarInscripcionesDeTomo(tomoId) });
  } catch (err) { next(err); }
}

export async function buscarInscripcion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const tomoId = idDeParam(req, 'id');
    const numero = enteroRequerido(req.query.numero, 'numero');
    const data = await inscripcionesService.buscarInscripcion(tomoId, numero);
    if (!data) throw new AppError(`No existe la inscripción ${numero} en este tomo`, 404);
    res.json({ data });
  } catch (err) { next(err); }
}

/** Búsqueda amplia — equivalente a LibrosService.buscarInscripcionesSid de SID (no requiere tomo preseleccionado). */
export async function buscarInscripciones(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const delegacionId = enteroRequerido(req.query.delegacion_id, 'delegacion_id');
    const seccionId     = req.query.seccion_id !== undefined ? enteroRequerido(req.query.seccion_id, 'seccion_id') : undefined;
    const tomoQuery      = typeof req.query.tomo === 'string' ? req.query.tomo : undefined;
    const inscripcion    = typeof req.query.inscripcion === 'string' ? req.query.inscripcion : undefined;
    const limit = req.query.limit !== undefined ? Math.min(1000, enteroRequerido(req.query.limit, 'limit')) : 300;

    const data = await inscripcionesService.buscarInscripciones({ delegacionId, seccionId, tomoQuery, inscripcion, limit });
    res.json({ data });
  } catch (err) { next(err); }
}

// ── Fojas ─────────────────────────────────────────────────────────────────────

export async function obtenerFoja(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const fojaId = idDeParam(req, 'id');
    const foja = await fojasService.obtenerFoja(fojaId);
    const imagenes = await fojasService.listarImagenesDeFoja(fojaId);
    res.json({ data: { ...foja, imagenes } });
  } catch (err) { next(err); }
}

export async function obtenerImagen(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const fojaId = idDeParam(req, 'id');

    const versionQuery = req.query.version;
    const version = imagenService.esVersionValida(versionQuery) ? versionQuery : undefined;
    if (versionQuery !== undefined && !version) throw new AppError('Versión de digitalización inválida', 422);

    const resultado = await imagenService.obtenerImagenProcesada({
      fojaId,
      version,
      sinMarcaDeAgua: esAdminEquivalente(user),
      usuarioEmail:   user.email,
      ipAddress:      ipDeRequest(req),
    });

    res.set({
      'Content-Type':             resultado.content_type,
      'Content-Length':           resultado.buffer.length.toString(),
      'Cache-Control':            'private, no-store',
      'X-Visor-Version-Servida':  resultado.version_servida,
    });
    res.send(resultado.buffer);
  } catch (err) { next(err); }
}

// ── Dictamen (curaduría) ─────────────────────────────────────────────────────

export async function obtenerDictamen(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const fojaId = idDeParam(req, 'id');
    res.json({ data: await dictamenService.obtenerDictamen(fojaId) });
  } catch (err) { next(err); }
}

function stringRequerido(valor: unknown, campo: string, maxLen: number): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new AppError(`${campo} es obligatorio`, 422);
  const texto = valor.trim();
  if (texto.length > maxLen) throw new AppError(`${campo} no puede exceder ${maxLen} caracteres`, 422);
  return texto;
}

export async function guardarDictamen(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    if (!puedeCurar(user)) {
      throw new AppError('No estás autorizado para emitir un dictamen de curaduría', 403);
    }
    const fojaId = idDeParam(req, 'id');

    const versionQuery = req.body.version_seleccionada;
    if (!imagenService.esVersionValida(versionQuery)) throw new AppError('version_seleccionada inválida', 422);

    const data = await dictamenService.guardarDictamen(
      fojaId,
      {
        version_seleccionada:   versionQuery,
        justificacion_juridica: stringRequerido(req.body.justificacion_juridica, 'justificacion_juridica', 4000),
      },
      user.id,
    );
    res.status(201).json({ data, message: 'Dictamen guardado correctamente' });
  } catch (err) { next(err); }
}

// ── Transcripción ─────────────────────────────────────────────────────────────

export async function obtenerTranscripcion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const fojaId = idDeParam(req, 'id');
    res.json({ data: await transcripcionService.obtenerTranscripcion(fojaId) });
  } catch (err) { next(err); }
}

export async function generarTranscripcion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const fojaId = idDeParam(req, 'id');
    const data = await transcripcionService.generarTranscripcionIA(fojaId, user.id);
    res.status(201).json({ data, message: 'Transcripción generada' });
  } catch (err) { next(err); }
}

export async function actualizarTranscripcion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = requireUser(req);
    await requireModuloVisor(user);
    const fojaId = idDeParam(req, 'id');
    const texto  = stringRequerido(req.body.texto_transcrito, 'texto_transcrito', 20_000);
    const data = await transcripcionService.actualizarTranscripcion(fojaId, texto, user.id);
    res.json({ data, message: 'Transcripción actualizada' });
  } catch (err) { next(err); }
}
