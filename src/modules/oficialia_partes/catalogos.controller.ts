/**
 * Controller: Catálogos de Ingreso de Oficio
 * File: src/modules/oficialia_partes/catalogos.controller.ts
 *
 * Tres catálogos INDEPENDIENTES entre sí (dependencia, unidad interna, remitente).
 * Ninguno depende de otro: las personas y las áreas se mueven de dependencia, así
 * que el Oficial elige cada uno por separado (y puede agregar al vuelo).
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';

// ═══════════════════════════ Dependencias ═══════════════════════════

// GET /catalogos/dependencias
export async function listarDependencias(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await db('catalogo_dependencias')
      .where({ activo: true }).select('id', 'nombre').orderBy('nombre', 'asc');
    res.json({ data });
  } catch (err) { next(err); }
}

// POST /catalogos/dependencias
export async function crearDependencia(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    // Las dependencias se guardan siempre en MAYÚSCULAS (convención del catálogo).
    const nombre = String(req.body?.nombre ?? '').trim().toUpperCase();
    if (!nombre) throw new AppError('El nombre de la dependencia es requerido', 422);
    const [row] = await db('catalogo_dependencias')
      .insert({ nombre, creado_por_id: req.user!.id })
      .onConflict('nombre').merge({ activo: true })
      .returning(['id', 'nombre']);
    res.status(201).json({ data: row });
  } catch (err) { next(err); }
}

// PATCH /catalogos/dependencias/:id
export async function editarDependencia(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
    const id = parseInt(req.params.id, 10);
    const nombre = String(req.body?.nombre ?? '').trim().toUpperCase();
    if (!nombre) throw new AppError('El nombre de la dependencia es requerido', 422);
    const dup = await db('catalogo_dependencias').where({ nombre }).whereNot({ id }).first();
    if (dup) throw new AppError('Ya existe una dependencia con ese nombre', 409);
    const [row] = await db('catalogo_dependencias').where({ id }).update({ nombre }).returning(['id', 'nombre']);
    if (!row) throw new AppError('Dependencia no encontrada', 404);
    res.json({ data: row });
  } catch (err) { next(err); }
}

// DELETE /catalogos/dependencias/:id
export async function eliminarDependencia(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
    const id = parseInt(req.params.id, 10);
    const deleted = await db('catalogo_dependencias').where({ id }).delete();
    if (!deleted) throw new AppError('Dependencia no encontrada', 404);
    res.json({ message: 'Dependencia eliminada' });
  } catch (err) { next(err); }
}

// ═══════════════════════════ Unidades internas ═══════════════════════════

// GET /catalogos/unidades-internas
export async function listarUnidadesInternas(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await db('catalogo_unidades_internas')
      .where({ activo: true }).select('id', 'nombre').orderBy('nombre', 'asc');
    res.json({ data });
  } catch (err) { next(err); }
}

// POST /catalogos/unidades-internas
export async function crearUnidadInterna(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const nombre = String(req.body?.nombre ?? '').trim().toUpperCase();
    if (!nombre) throw new AppError('El nombre de la unidad interna es requerido', 422);
    const [row] = await db('catalogo_unidades_internas')
      .insert({ nombre, creado_por_id: req.user!.id })
      .onConflict('nombre').merge({ activo: true })
      .returning(['id', 'nombre']);
    res.status(201).json({ data: row });
  } catch (err) { next(err); }
}

// PATCH /catalogos/unidades-internas/:id
export async function editarUnidadInterna(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
    const id = parseInt(req.params.id, 10);
    const nombre = String(req.body?.nombre ?? '').trim().toUpperCase();
    if (!nombre) throw new AppError('El nombre de la unidad interna es requerido', 422);
    const dup = await db('catalogo_unidades_internas').where({ nombre }).whereNot({ id }).first();
    if (dup) throw new AppError('Ya existe una unidad interna con ese nombre', 409);
    const [row] = await db('catalogo_unidades_internas').where({ id }).update({ nombre }).returning(['id', 'nombre']);
    if (!row) throw new AppError('Unidad interna no encontrada', 404);
    res.json({ data: row });
  } catch (err) { next(err); }
}

// DELETE /catalogos/unidades-internas/:id
export async function eliminarUnidadInterna(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
    const id = parseInt(req.params.id, 10);
    const deleted = await db('catalogo_unidades_internas').where({ id }).delete();
    if (!deleted) throw new AppError('Unidad interna no encontrada', 404);
    res.json({ message: 'Unidad interna eliminada' });
  } catch (err) { next(err); }
}

// ═══════════════════════════ Remitentes (personas, independientes) ═══════════════════════════

// GET /catalogos/remitentes
export async function listarRemitentes(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const data = await db('catalogo_remitentes')
      .where({ activo: true }).select('id', 'nombre').orderBy('nombre', 'asc');
    res.json({ data });
  } catch (err) { next(err); }
}

// POST /catalogos/remitentes
export async function crearRemitente(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const nombre = String(req.body?.nombre ?? '').trim().toUpperCase();
    if (!nombre) throw new AppError('El nombre del remitente es requerido', 422);
    const [row] = await db('catalogo_remitentes')
      .insert({ nombre, creado_por_id: req.user!.id })
      .onConflict('nombre').merge({ activo: true })
      .returning(['id', 'nombre']);
    res.status(201).json({ data: row });
  } catch (err) { next(err); }
}

// PATCH /catalogos/remitentes/:id
export async function editarRemitente(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
    const id = parseInt(req.params.id, 10);
    const nombre = String(req.body?.nombre ?? '').trim().toUpperCase();
    if (!nombre) throw new AppError('El nombre del remitente es requerido', 422);
    const dup = await db('catalogo_remitentes').where({ nombre }).whereNot({ id }).first();
    if (dup) throw new AppError('Ya existe un remitente con ese nombre', 409);
    const [row] = await db('catalogo_remitentes').where({ id }).update({ nombre }).returning(['id', 'nombre']);
    if (!row) throw new AppError('Remitente no encontrado', 404);
    res.json({ data: row });
  } catch (err) { next(err); }
}

// DELETE /catalogos/remitentes/:id
export async function eliminarRemitente(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (req.user!.rol !== 'SUPERADMIN') throw new AppError('No autorizado', 403);
    const id = parseInt(req.params.id, 10);
    const deleted = await db('catalogo_remitentes').where({ id }).delete();
    if (!deleted) throw new AppError('Remitente no encontrado', 404);
    res.json({ message: 'Remitente eliminado' });
  } catch (err) { next(err); }
}
