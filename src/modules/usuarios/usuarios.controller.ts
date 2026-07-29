/**
 * Controller: Usuarios
 * File: src/modules/usuarios/usuarios.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET  /usuarios          → listado filtrable por rol
 *  GET  /usuarios/:id      → detalle de un usuario
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import type { RolUsuario } from '../oficialia_partes/oficios.types';

const ROLES_VALIDOS: RolUsuario[] = ['OFICIAL', 'ENCARGADO', 'JURIDICO', 'SECRETARIA', 'DIRECTOR', 'OPERATIVO', 'SUPERADMIN'];

// ── GET /usuarios ─────────────────────────────────────────────

export async function listarUsuarios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rol, oficina_id, search } = req.query;

    // Validar rol si se pasa como filtro
    if (rol && !ROLES_VALIDOS.includes(rol as RolUsuario)) {
      throw new AppError(`Rol inválido: ${rol}`, 400);
    }

    let query = db('usuarios as u')
      .join('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .select(
        'u.id',
        'u.nombre',
        'u.cargo',
        'u.email',
        'u.rol',
        'u.unidad_id',
        'cu.nombre as oficina_nombre',
        'cu.tipo as unidad_tipo',
      );

    if (rol)       query = query.where('u.rol', rol as string);
    if (oficina_id) query = query.where('u.unidad_id', Number(oficina_id));
    if (search) {
      const term = `%${search}%`;
      query = query.where((q) =>
        q.whereILike('u.nombre', term).orWhereILike('u.email', term),
      );
    }

    const usuarios = await query.orderBy('u.nombre', 'asc');

    res.json({ data: usuarios });
  } catch (err) {
    next(err);
  }
}

// ── GET /usuarios/:id ─────────────────────────────────────────

export async function obtenerUsuario(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);

    const usuario = await db('usuarios as u')
      .join('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .select(
        'u.id',
        'u.nombre',
        'u.email',
        'u.rol',
        'u.unidad_id',
        'cu.nombre as oficina_nombre',
        'cu.tipo as unidad_tipo',
      )
      .where('u.id', id)
      .first();

    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    res.json({ data: usuario });
  } catch (err) {
    next(err);
  }
}

// ── GET /usuarios/mis-modulos ─────────────────────────────────
// Cualquier usuario autenticado puede consultar sus propios módulos habilitados.

export async function getMisModulos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    const modulos = await db('modulos as m')
      .leftJoin('usuario_modulos as um', function () {
        this.on('um.modulo_id', 'm.id').andOnVal('um.usuario_id', userId);
      })
      .where('m.activo', true)
      .select(
        'm.id',
        'm.clave',
        'm.nombre_display',
        'm.descripcion',
        'm.activo',
        'm.orden',
        db.raw('CASE WHEN um.usuario_id IS NOT NULL THEN true ELSE false END AS habilitado'),
        'um.asignado_en',
      )
      .orderBy('m.orden', 'asc');

    res.json({ data: modulos });
  } catch (err) { next(err); }
}

// ── GET /usuarios/mis-roles-flujo ─────────────────────────────
// Devuelve los roles de flujo configurados para el usuario autenticado.
// También incluye 'JURIDICO' si el usuario tiene asignaciones en asignaciones_juridicas.
// Accesible para cualquier usuario autenticado.

export async function getMisRolesFlujo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    const roles = await db('configuracion_flujos')
      .where({ usuario_id: userId })
      .select('modulo_clave', 'rol_flujo', 'unidad_id');

    // Si tiene asignaciones jurídicas, agregar rol JURIDICO para routing
    const tieneAsignaciones = await db('asignaciones_juridicas')
      .where({ abogado_id: userId })
      .first();

    if (tieneAsignaciones) {
      const yaTieneJuridico = roles.some(
        (r: any) => r.modulo_clave === 'oficialia_partes' && r.rol_flujo === 'JURIDICO'
      );
      if (!yaTieneJuridico) {
        roles.push({ modulo_clave: 'oficialia_partes', rol_flujo: 'JURIDICO', unidad_id: null });
      }
    }

    res.json({ data: roles });
  } catch (err) { next(err); }
}
