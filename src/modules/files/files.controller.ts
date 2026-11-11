/**
 * Controller: Files — serve stored PDFs
 * File: src/modules/files/files.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET /files/:id/original       → PDF original del oficio
 *  GET /files/:id/proyecto       → Borrador subido por el abogado
 *  GET /files/:id/proyecto/info  → Metadata del borrador
 *  GET /files/:id/firmado        → Documento firmado por secretaría
 *
 * El `:id` es SIEMPRE el id del oficio, también en las rutas del proyecto y del
 * firmado (ahí consulta `gestiones_contestacion.oficio_id`). Por eso la
 * autorización es una sola pregunta: ¿puede esta persona ver este oficio?
 *
 * ── Por qué estos handlers autorizan ──────────────────────────────────────────
 *
 * Antes solo exigían sesión. `authenticate` corre en el router, pero cualquier
 * token válido servía: los cuatro tomaban el id de la URL, consultaban por él y
 * entregaban el archivo. Con eso, cualquier usuario autenticado —de cualquier
 * rol y cualquier delegación— podía leer todos los oficios originales, todos los
 * borradores jurídicos y todas las resoluciones firmadas del sistema iterando el
 * id. La bandeja sí filtraba por rol; estas rutas eran la puerta de atrás.
 *
 * La regla de visibilidad no se reescribe aquí: se toma de
 * `oficios.visibilidad.ts`, que usa los mismos predicados SQL que la bandeja.
 */

import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs   from 'fs';
import { db }        from '../../db';
import { AppError }  from '../../utils/AppError';
import { puedeVerOficio } from '../oficialia_partes/oficios.visibilidad';

const STORAGE_BASE = process.env.STORAGE_LOCAL_PATH ?? path.join(process.cwd(), 'storage');

/** Detect MIME type from file extension */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf':  return 'application/pdf';
    case '.doc':  return 'application/msword';
    case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:      return 'application/octet-stream';
  }
}

/**
 * Valida el id de la URL y comprueba que quien pide pueda ver ese oficio.
 *
 * Devuelve el id ya validado. Lanza `AppError` con el código que corresponde:
 *   · 400 — el id no es un entero (antes `parseInt` dejaba pasar `NaN`)
 *   · 401 — sin usuario en la petición (no debería ocurrir tras `authenticate`)
 *   · 403 — el oficio queda fuera del alcance de esta persona
 *
 * El 404 lo decide cada handler: solo él sabe qué fila buscaba.
 */
async function oficioAutorizado(req: Request): Promise<number> {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('Id de oficio inválido', 400);
  }

  const user = req.user;
  if (!user) throw new AppError('Token requerido', 401);

  if (!(await puedeVerOficio(user, id))) {
    throw new AppError('No tienes acceso a este documento', 403);
  }

  return id;
}

/** Resolve an absolute path and stream it, or 404 */
function serveFile(res: Response, next: NextFunction, filePath: string | null, label: string): void {
  if (!filePath) {
    return next(new AppError(`${label} no disponible`, 404));
  }

  // filePath stored as '/oficios/originales/filename.pdf'
  // Strip leading slash and join with storage base
  const relative = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const absolute = path.join(STORAGE_BASE, relative);

  if (!fs.existsSync(absolute)) {
    return next(new AppError(`Archivo no encontrado en el servidor`, 404));
  }

  // Security: ensure resolved path stays inside STORAGE_BASE
  const resolved = path.resolve(absolute);
  if (!resolved.startsWith(path.resolve(STORAGE_BASE))) {
    return next(new AppError('Acceso denegado', 403));
  }

  const mimeType = getMimeType(absolute);
  const filename = path.basename(absolute);

  res.setHeader('Content-Type', mimeType);
  // PDFs inline, Word as attachment (triggers download)
  const disposition = mimeType === 'application/pdf' ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  fs.createReadStream(resolved).pipe(res);
}

// ── GET /files/:id/original ───────────────────────────────────

export async function serveOriginal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id  = await oficioAutorizado(req);
    const row = await db('oficios').where({ id }).select('pdf_original_path').first();
    if (!row) return next(new AppError('Oficio no encontrado', 404));
    serveFile(res, next, row.pdf_original_path, 'PDF original');
  } catch (err) { next(err); }
}

// ── GET /files/:id/proyecto/info ─────────────────────────────

/**
 * Devuelve metadata del proyecto: tipo de archivo y texto extraído.
 * Permite al frontend decidir si mostrar iframe (PDF) o descarga (Word).
 */
export async function infoProyecto(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id  = await oficioAutorizado(req);
    const row = await db('gestiones_contestacion')
      .where({ oficio_id: id })
      .select('proyecto_url', 'texto_proyecto')
      .first();

    if (!row) return next(new AppError('Gestión no encontrada', 404));

    const ext = row.proyecto_url ? path.extname(row.proyecto_url).toLowerCase() : '';
    const isWord = ext === '.doc' || ext === '.docx';

    res.json({
      data: {
        es_word:        isWord,
        extension:      ext,
        texto_proyecto: row.texto_proyecto ?? null,
      },
    });
  } catch (err) { next(err); }
}

// ── GET /files/:id/proyecto ───────────────────────────────────

export async function serveProyecto(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id  = await oficioAutorizado(req);
    const row = await db('gestiones_contestacion')
      .where({ oficio_id: id })
      .select('proyecto_url')
      .first();
    if (!row) return next(new AppError('Gestión no encontrada', 404));
    serveFile(res, next, row.proyecto_url, 'Proyecto de contestación');
  } catch (err) { next(err); }
}

// ── GET /files/:id/firmado ────────────────────────────────────

export async function serveFirmado(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id  = await oficioAutorizado(req);
    const row = await db('gestiones_contestacion')
      .where({ oficio_id: id })
      .select('escaneo_firmado_url')
      .first();
    if (!row) return next(new AppError('Documento firmado no encontrado', 404));
    serveFile(res, next, row.escaneo_firmado_url, 'Documento firmado');
  } catch (err) { next(err); }
}
