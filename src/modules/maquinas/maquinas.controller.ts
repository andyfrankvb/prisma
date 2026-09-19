/**
 * Controller: Máquinas
 * File: src/modules/maquinas/maquinas.controller.ts
 *
 * Migrado desde SID (backend/app/Http/Controllers/MaquinaController.php).
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET    /maquinas      → listado, filtrable por texto y por disponibilidad
 *  GET    /maquinas/:id  → detalle de una máquina
 *  POST   /maquinas      → alta
 *  PUT    /maquinas/:id  → edición (reemplaza el recurso completo, igual que el legacy)
 *  DELETE /maquinas/:id  → baja
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import { Maquina, MaquinaPayload } from './maquinas.types';

const NUMERO_MAQUINA_MAX_LEN = 50;
const OFICINA_MAX_LEN        = 255;

function validarPayload(body: any): MaquinaPayload {
  const { numero_maquina, oficina, libre } = body ?? {};

  if (typeof numero_maquina !== 'string' || !numero_maquina.trim()) {
    throw new AppError('numero_maquina es requerido', 400);
  }
  if (numero_maquina.trim().length > NUMERO_MAQUINA_MAX_LEN) {
    throw new AppError(`numero_maquina no puede exceder ${NUMERO_MAQUINA_MAX_LEN} caracteres`, 400);
  }
  if (typeof oficina !== 'string' || !oficina.trim()) {
    throw new AppError('oficina es requerida', 400);
  }
  if (oficina.trim().length > OFICINA_MAX_LEN) {
    throw new AppError(`oficina no puede exceder ${OFICINA_MAX_LEN} caracteres`, 400);
  }
  if (typeof libre !== 'boolean') {
    throw new AppError('libre es requerido y debe ser booleano', 400);
  }

  return { numero_maquina: numero_maquina.trim(), oficina: oficina.trim(), libre };
}

// ── GET /maquinas ───────────────────────────────────────────────

export async function listarMaquinas(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { search, libre } = req.query;

    let query = db('maquina');
    if (search) {
      const term = `%${String(search).trim()}%`;
      query = query.where((q) =>
        q.whereILike('numero_maquina', term).orWhereILike('oficina', term),
      );
    }
    if (libre === 'true')  query = query.andWhere('libre', true);
    if (libre === 'false') query = query.andWhere('libre', false);

    const maquinas = await query.orderBy('fecha_registro', 'asc') as Maquina[];
    res.json({ data: maquinas });
  } catch (err) { next(err); }
}

// ── GET /maquinas/:id ───────────────────────────────────────────

export async function obtenerMaquina(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    const maquina = await db('maquina').where({ id_maquina: id }).first();
    if (!maquina) throw new AppError('Máquina no encontrada', 404);
    res.json({ data: maquina });
  } catch (err) { next(err); }
}

// ── POST /maquinas ──────────────────────────────────────────────

export async function crearMaquina(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const datos = validarPayload(req.body);

    const duplicada = await db('maquina').where({ numero_maquina: datos.numero_maquina }).first();
    if (duplicada) throw new AppError('Ya existe una máquina con ese número', 409);

    const [maquina] = await db('maquina')
      .insert({ ...datos, fecha_registro: db.fn.now() })
      .returning(['id_maquina', 'numero_maquina', 'oficina', 'libre', 'fecha_registro']);

    res.status(201).json({ data: maquina, message: 'Máquina creada correctamente' });
  } catch (err) { next(err); }
}

// ── PUT /maquinas/:id ───────────────────────────────────────────

export async function editarMaquina(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);

    const existente = await db('maquina').where({ id_maquina: id }).first();
    if (!existente) throw new AppError('Máquina no encontrada', 404);

    const datos = validarPayload(req.body);

    const duplicada = await db('maquina')
      .where({ numero_maquina: datos.numero_maquina })
      .whereNot({ id_maquina: id })
      .first();
    if (duplicada) throw new AppError('Ya existe una máquina con ese número', 409);

    const [maquina] = await db('maquina')
      .where({ id_maquina: id })
      .update(datos)
      .returning(['id_maquina', 'numero_maquina', 'oficina', 'libre', 'fecha_registro']);

    res.json({ data: maquina, message: 'Máquina actualizada correctamente' });
  } catch (err) { next(err); }
}

// ── DELETE /maquinas/:id ────────────────────────────────────────

export async function eliminarMaquina(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    const eliminadas = await db('maquina').where({ id_maquina: id }).delete();
    if (!eliminadas) throw new AppError('Máquina no encontrada', 404);
    res.json({ message: 'Máquina eliminada correctamente' });
  } catch (err) { next(err); }
}
