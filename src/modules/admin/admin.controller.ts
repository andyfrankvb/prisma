/**
 * Controller: Admin — CRUD de Usuarios
 * File: src/modules/admin/admin.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET    /admin/usuarios          → listado con filtros
 *  GET    /admin/usuarios/:id      → detalle
 *  POST   /admin/usuarios          → crear usuario
 *  PATCH  /admin/usuarios/:id      → editar (nombre, email, rol, oficina)
 *  PATCH  /admin/usuarios/:id/toggle-activo → habilitar / deshabilitar
 *  PATCH  /admin/usuarios/:id/reset-password → resetear contraseña
 */

import { Request, Response, NextFunction } from 'express';
import bcrypt    from 'bcrypt';
import { db }    from '../../db';
import { AppError } from '../../utils/AppError';

type RolUsuario = 'OFICIAL' | 'ENCARGADO' | 'JURIDICO' | 'SECRETARIA' | 'DIRECTOR' | 'SUPERADMIN' | 'OPERATIVO' | 'PARTICULAR';

const ROLES_VALIDOS: RolUsuario[] = [
  'OFICIAL', 'ENCARGADO', 'JURIDICO', 'SECRETARIA', 'DIRECTOR', 'SUPERADMIN', 'OPERATIVO', 'PARTICULAR',
];

// El identificador de acceso es un "usuario" sin dominio (letras, números,
// punto, guion y guion bajo). Ej: fabianmontiel, op.juridico1, maria.pena
const EMAIL_RE = /^[a-z0-9._-]+$/i;

// ── GET /admin/usuarios ───────────────────────────────────────

export async function listarUsuariosAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rol, oficina_id, search, activo } = req.query;

    const page  = Math.max(1, parseInt(String(req.query.page  ?? 1), 10));
    const limit = Math.min(100, parseInt(String(req.query.limit ?? 20), 10));
    const offset = (page - 1) * limit;

    let query = db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .select(
        'u.id',
        'u.nombre',
        'u.email',
        'u.rol',
        'u.activo',
        'u.unidad_id',
        db.raw("COALESCE(cu.nombre, '—') as oficina_nombre"),
        db.raw("cu.tipo as unidad_tipo"),
      );

    if (rol)       query = query.where('u.rol', rol as string);
    if (oficina_id) query = query.where('u.unidad_id', Number(oficina_id));
    if (activo !== undefined) query = query.where('u.activo', activo === 'true');
    if (search) {
      const term = `%${search}%`;
      query = query.where((q) =>
        q.whereILike('u.nombre', term).orWhereILike('u.email', term),
      );
    }

    const countRows = await query.clone().clearSelect().count('u.id as count');
    const total     = Number((countRows[0] as any)?.count ?? 0);
    const usuarios  = await query.orderBy('u.nombre', 'asc').limit(limit).offset(offset);

    res.json({ data: usuarios, meta: { total, page, limit } });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/usuarios/:id ───────────────────────────────────

export async function obtenerUsuarioAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);

    const usuario = await db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .select(
        'u.id', 'u.nombre', 'u.email', 'u.rol', 'u.activo',
        'u.unidad_id', db.raw("COALESCE(cu.nombre, '—') as oficina_nombre"),
        db.raw("cu.tipo as unidad_tipo"),
      )
      .where('u.id', id)
      .first();

    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    res.json({ data: usuario });
  } catch (err) {
    next(err);
  }
}

// ── POST /admin/usuarios ──────────────────────────────────────

export async function crearUsuario(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { nombre, email, password, rol, oficina_id } = req.body;

    // Validaciones
    if (!nombre?.trim())                    throw new AppError('nombre es requerido', 400);
    if (!email || !EMAIL_RE.test(email))    throw new AppError('usuario inválido', 400);
    if (!password || password.length < 8)   throw new AppError('La contraseña debe tener al menos 8 caracteres', 400);
    if (!rol || !ROLES_VALIDOS.includes(rol)) throw new AppError(`rol inválido: ${rol}`, 400);
    if (!oficina_id)                        throw new AppError('unidad_id es requerido', 400);

    // Email único
    const existe = await db('usuarios').where({ email: email.toLowerCase().trim() }).first();
    if (existe) throw new AppError('Ya existe un usuario con ese email', 409);

    // Verificar que la unidad existe
    const unidad = await db('catalogo_unidades').where({ id: oficina_id }).first();
    if (!unidad) throw new AppError('Unidad no encontrada', 404);

    const password_hash = await bcrypt.hash(password, 12);

    const [usuario] = await db('usuarios')
      .insert({
        nombre:     nombre.trim(),
        email:      email.toLowerCase().trim(),
        password_hash,
        rol,
        unidad_id:  Number(oficina_id),
        activo:     true,
      })
      .returning(['id', 'nombre', 'email', 'rol', 'activo', 'unidad_id']);

    res.status(201).json({ data: usuario, message: 'Usuario creado correctamente' });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /admin/usuarios/:id ─────────────────────────────────

export async function editarUsuario(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    const { nombre, email, rol, oficina_id } = req.body;

    const usuario = await db('usuarios').where({ id }).first();
    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    const updates: Record<string, any> = {};

    if (nombre !== undefined) {
      if (!nombre.trim()) throw new AppError('nombre no puede estar vacío', 400);
      updates.nombre = nombre.trim();
    }

    if (email !== undefined) {
      if (!EMAIL_RE.test(email)) throw new AppError('usuario inválido', 400);
      const emailNorm = email.toLowerCase().trim();
      const duplicado = await db('usuarios')
        .where({ email: emailNorm })
        .whereNot({ id })
        .first();
      if (duplicado) throw new AppError('Ya existe un usuario con ese email', 409);
      updates.email = emailNorm;
    }

    if (rol !== undefined) {
      if (!ROLES_VALIDOS.includes(rol)) throw new AppError(`rol inválido: ${rol}`, 400);
      updates.rol = rol;
    }

    if (oficina_id !== undefined) {
      const unidad = await db('catalogo_unidades').where({ id: oficina_id }).first();
      if (!unidad) throw new AppError('Unidad no encontrada', 404);
      updates.unidad_id = Number(oficina_id);
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError('No se enviaron campos para actualizar', 400);
    }

    const [actualizado] = await db('usuarios')
      .where({ id })
      .update(updates)
      .returning(['id', 'nombre', 'email', 'rol', 'activo', 'unidad_id']);

    res.json({ data: actualizado, message: 'Usuario actualizado correctamente' });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /admin/usuarios/:id/toggle-activo ───────────────────

export async function toggleActivoUsuario(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id        = parseInt(req.params.id, 10);
    const requester = req.user!;

    // No puede deshabilitarse a sí mismo
    if (id === requester.id) {
      throw new AppError('No puedes deshabilitar tu propia cuenta', 422);
    }

    const usuario = await db('usuarios').where({ id }).first();
    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    const nuevoEstado = !usuario.activo;

    await db('usuarios').where({ id }).update({ activo: nuevoEstado });

    // Si se va a desactivar, advertir si el usuario está asignado a flujos
    let advertencia: { modulo_clave: string; rol_flujo: string }[] | undefined;
    if (nuevoEstado === false) {
      const flujos = await db('configuracion_flujos')
        .where({ usuario_id: id })
        .select('modulo_clave', 'rol_flujo');
      if (flujos.length > 0) {
        advertencia = flujos;
      }
    }

    res.json({
      message:    nuevoEstado ? 'Usuario habilitado' : 'Usuario deshabilitado',
      activo:     nuevoEstado,
      ...(advertencia ? { advertencia } : {}),
    });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /admin/usuarios/:id/reset-password ──────────────────

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    const { nueva_password } = req.body;

    if (!nueva_password || nueva_password.length < 8) {
      throw new AppError('La nueva contraseña debe tener al menos 8 caracteres', 400);
    }

    const usuario = await db('usuarios').where({ id }).first();
    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    const password_hash = await bcrypt.hash(nueva_password, 12);
    await db('usuarios').where({ id }).update({ password_hash });

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/oficinas ───────────────────────────────────────

export async function listarOficinas(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const unidades = await db('catalogo_unidades')
      .select('id', 'nombre', 'tipo', 'clave', 'activo')
      .orderBy('tipo', 'asc')
      .orderBy('nombre', 'asc');
    res.json({ data: unidades });
  } catch (err) {
    next(err);
  }
}

// ── GET /admin/modulos ────────────────────────────────────────

export async function listarModulos(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const modulos = await db('modulos')
      .select('id', 'clave', 'nombre_display', 'descripcion', 'activo', 'orden')
      .orderBy('orden', 'asc');

    res.json({ data: modulos });
  } catch (err) { next(err); }
}

// ── GET /admin/usuarios/:id/modulos ───────────────────────────

export async function listarModulosUsuario(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);

    const usuario = await db('usuarios')
      .select('id', 'nombre', 'email', 'rol')
      .where({ id })
      .first();
    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    // Todos los módulos con flag habilitado para este usuario
    const modulos = await db('modulos as m')
      .leftJoin('usuario_modulos as um', function () {
        this.on('um.modulo_id', 'm.id').andOnVal('um.usuario_id', id);
      })
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

// ── POST /admin/usuarios/:id/modulos/:moduloId ────────────────

export async function habilitarModulo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const usuarioId = parseInt(req.params.id, 10);
    const moduloId  = parseInt(req.params.moduloId, 10);
    const requester = req.user!;

    if (usuarioId === requester.id) {
      throw new AppError('No puedes modificar los módulos de tu propia sesión', 422);
    }

    const usuario = await db('usuarios').where({ id: usuarioId }).first();
    if (!usuario) throw new AppError('Usuario no encontrado', 404);

    const modulo = await db('modulos').where({ id: moduloId }).first();
    if (!modulo) throw new AppError('Módulo no encontrado', 404);

    try {
      await db('usuario_modulos').insert({
        usuario_id:      usuarioId,
        modulo_id:       moduloId,
        asignado_por_id: requester.id,
        asignado_en:     db.fn.now(),
      });
    } catch (err: any) {
      // Violación de PK única → módulo ya habilitado
      if (err.code === '23505') {
        throw new AppError('El módulo ya está habilitado para este usuario', 409);
      }
      throw err;
    }

    res.json({ message: 'Módulo habilitado correctamente', habilitado: true });
  } catch (err) { next(err); }
}

// ── DELETE /admin/usuarios/:id/modulos/:moduloId ──────────────

export async function revocarModulo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const usuarioId = parseInt(req.params.id, 10);
    const moduloId  = parseInt(req.params.moduloId, 10);
    const requester = req.user!;

    if (usuarioId === requester.id) {
      throw new AppError('No puedes modificar los módulos de tu propia sesión', 422);
    }

    const deleted = await db('usuario_modulos')
      .where({ usuario_id: usuarioId, modulo_id: moduloId })
      .delete();

    if (!deleted) {
      throw new AppError('El módulo no está habilitado para este usuario', 404);
    }

    res.json({ message: 'Módulo revocado correctamente', habilitado: false });
  } catch (err) { next(err); }
}

// ── Configuración de Flujos ───────────────────────────────────

import {
  COMPATIBILITY_RULES,
  getRolesConfigurables,
  isCompatible,
  invalidateActorFlujoCache,
} from '../../services/flujo-config.service';

// ── GET /admin/flujos ─────────────────────────────────────────

export async function listarFlujos(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Obtener todas las configuraciones existentes con JOINs
    const rows = await db('configuracion_flujos as cf')
      .join('modulos as m', 'm.clave', 'cf.modulo_clave')
      .leftJoin('usuarios as ua', 'ua.id', 'cf.usuario_id')
      .leftJoin('usuarios as up', 'up.id', 'cf.actualizado_por_id')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'cf.unidad_id')
      .select(
        'cf.id',
        'cf.modulo_clave',
        'm.nombre_display as modulo_nombre',
        'cf.rol_flujo',
        'cf.usuario_id',
        'ua.nombre as usuario_nombre',
        'ua.email as usuario_email',
        'ua.rol as usuario_rol',
        'cf.unidad_id',
        'cu.nombre as unidad_nombre',
        'cf.actualizado_en',
        'up.nombre as actualizado_por_nombre',
      );

    // Construir mapa de configuraciones existentes (clave: modulo:rol o modulo:rol:unidad_id)
    const configMap = new Map<string, any[]>();
    for (const row of rows) {
      const key = `${row.modulo_clave}:${row.rol_flujo}`;
      if (!configMap.has(key)) configMap.set(key, []);
      configMap.get(key)!.push(row);
    }

    // Obtener todos los módulos
    const modulos = await db('modulos')
      .select('clave', 'nombre_display', 'descripcion')
      .orderBy('orden', 'asc');

    // Obtener todas las unidades para mostrar opciones
    const unidades = await db('catalogo_unidades')
      .where({ activo: true })
      .select('id', 'nombre', 'tipo')
      .orderBy('tipo', 'asc')
      .orderBy('nombre', 'asc');

    // Agrupar por módulo
    const resultado: Record<string, any> = {};

    for (const modulo of modulos) {
      const rolesConfigurables = getRolesConfigurables(modulo.clave);
      if (rolesConfigurables.length === 0) continue;

      const roles = rolesConfigurables.map((rol) => {
        const key  = `${modulo.clave}:${rol}`;
        const cfgs = configMap.get(key) ?? [];
        const rule = (COMPATIBILITY_RULES as any)[modulo.clave]?.[rol];

        return {
          rol_flujo:            rol,
          por_unidad:           cfgs.length > 1 || cfgs.some((c: any) => c.unidad_id !== null),
          configuraciones:      cfgs.map((c: any) => ({
            id:                     c.id,
            usuario_id:             c.usuario_id,
            usuario_nombre:         c.usuario_nombre,
            usuario_email:          c.usuario_email,
            usuario_rol:            c.usuario_rol,
            unidad_id:              c.unidad_id,
            unidad_nombre:          c.unidad_nombre,
            actualizado_en:         c.actualizado_en,
            actualizado_por_nombre: c.actualizado_por_nombre,
          })),
          // Para compatibilidad con roles de un solo usuario
          usuario_id:             cfgs[0]?.usuario_id ?? null,
          usuario_nombre:         cfgs[0]?.usuario_nombre ?? null,
          usuario_email:          cfgs[0]?.usuario_email ?? null,
          usuario_rol:            cfgs[0]?.usuario_rol ?? null,
          actualizado_en:         cfgs[0]?.actualizado_en ?? null,
          actualizado_por_nombre: cfgs[0]?.actualizado_por_nombre ?? null,
          regla_compatibilidad: rule ? {
            rol_sistema_requerido: rule.rolSistema,
            unidad_tipo_requerida: rule.unidadTipo ?? null,
            descripcion:           rule.descripcion,
          } : null,
        };
      });

      resultado[modulo.clave] = {
        modulo_clave:  modulo.clave,
        modulo_nombre: modulo.nombre_display,
        descripcion:   modulo.descripcion,
        roles,
        unidades,
      };
    }

    res.json({ data: Object.values(resultado) });
  } catch (err) { next(err); }
}

// ── PUT /admin/flujos/:modulo/:rol ────────────────────────────

export async function actualizarFlujo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const moduloClave = req.params.modulo;
    const rolFlujo    = req.params.rol;
    const { usuario_id, unidad_id } = req.body;
    const requester   = req.user!;

    const modulo = await db('modulos').where({ clave: moduloClave }).first();
    if (!modulo) throw new AppError(`Módulo '${moduloClave}' no encontrado`, 404);

    const rolesValidos = getRolesConfigurables(moduloClave);
    if (!rolesValidos.includes(rolFlujo)) {
      throw new AppError(`Rol '${rolFlujo}' no es configurable para '${moduloClave}'. Roles válidos: ${rolesValidos.join(', ')}`, 422);
    }

    if (!usuario_id) throw new AppError('usuario_id es requerido', 422);

    const usuario = await db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .select('u.id', 'u.nombre', 'u.activo', 'u.rol', 'cu.tipo as unidad_tipo')
      .where('u.id', Number(usuario_id))
      .first();

    if (!usuario) throw new AppError('Usuario no encontrado', 422);
    if (!usuario.activo) throw new AppError('El usuario está inactivo', 422);

    // Roles de un solo usuario global (sin unidad): ENCARGADO y SECRETARIA en oficialía
    const ROLES_GLOBALES: Record<string, string[]> = {
      oficialia_partes: ['ENCARGADO', 'SECRETARIA'],
    };
    const esRolGlobal = ROLES_GLOBALES[moduloClave]?.includes(rolFlujo);
    const unidadIdVal = (unidad_id && !esRolGlobal) ? Number(unidad_id) : null;

    // Si es rol global y se intenta pasar unidad_id, rechazar
    if (esRolGlobal && unidad_id) {
      throw new AppError(`El rol '${rolFlujo}' solo admite un usuario global, sin filtro por unidad`, 422);
    }

    // Roles que SIEMPRE requieren delegación (uno por unidad). Sin unidad,
    // el upsert crearía filas NULL duplicadas (NULLS DISTINCT). Se exige unidad.
    const ROLES_POR_UNIDAD_OBLIGATORIA: Record<string, string[]> = {
      oficialia_partes: ['OFICIAL'],
    };
    if (ROLES_POR_UNIDAD_OBLIGATORIA[moduloClave]?.includes(rolFlujo) && !unidadIdVal) {
      throw new AppError(`El rol '${rolFlujo}' requiere seleccionar una delegación`, 422);
    }

    await db.transaction(async (trx) => {
      const anterior = await trx('configuracion_flujos')
        .where({ modulo_clave: moduloClave, rol_flujo: rolFlujo, unidad_id: unidadIdVal })
        .select('usuario_id')
        .first();

      await trx('configuracion_flujos')
        .insert({
          modulo_clave:       moduloClave,
          rol_flujo:          rolFlujo,
          usuario_id:         Number(usuario_id),
          unidad_id:          unidadIdVal,
          actualizado_por_id: requester.id,
          actualizado_en:     new Date(),
        })
        .onConflict(['modulo_clave', 'rol_flujo', 'unidad_id'])
        .merge({ usuario_id: Number(usuario_id), actualizado_por_id: requester.id, actualizado_en: new Date() });

      await trx('auditoria_configuracion_flujos').insert({
        modulo_clave:        moduloClave,
        rol_flujo:           rolFlujo,
        usuario_id_anterior: anterior?.usuario_id ?? null,
        usuario_id_nuevo:    Number(usuario_id),
        actualizado_por_id:  requester.id,
        actualizado_en:      new Date(),
      });
    });

    invalidateActorFlujoCache(moduloClave, rolFlujo);
    res.json({ message: 'Configuración actualizada correctamente' });
  } catch (err) { next(err); }
}

// ── DELETE /admin/flujos/:modulo/:rol/:unidadId ───────────────

export async function eliminarFlujoUnidad(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { modulo, rol, unidadId } = req.params;
    const deleted = await db('configuracion_flujos')
      .where({ modulo_clave: modulo, rol_flujo: rol, unidad_id: Number(unidadId) })
      .delete();
    if (!deleted) throw new AppError('Configuración no encontrada', 404);
    invalidateActorFlujoCache(modulo, rol);
    res.json({ message: 'Configuración eliminada' });
  } catch (err) { next(err); }
}

// ── GET /admin/flujos/:modulo/:rol/usuarios-disponibles ───────

export async function listarUsuariosDisponibles(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const moduloClave = req.params.modulo;
    const rolFlujo    = req.params.rol;

    // Validar módulo
    const modulo = await db('modulos').where({ clave: moduloClave }).first();
    if (!modulo) {
      throw new AppError(`Módulo '${moduloClave}' no encontrado`, 404);
    }

    // Validar rol
    const rolesValidos = getRolesConfigurables(moduloClave);
    if (!rolesValidos.includes(rolFlujo)) {
      throw new AppError(
        `Rol '${rolFlujo}' no es configurable para el módulo '${moduloClave}'. Roles válidos: ${rolesValidos.join(', ')}`,
        422,
      );
    }

    // Obtener regla de compatibilidad
    const rule = (COMPATIBILITY_RULES as any)[moduloClave]?.[rolFlujo];

    // Construir query de usuarios activos — sin filtro de rol de sistema
    // El rol funcional se gestiona desde Configuración de Flujos
    let query = db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .select(
        'u.id',
        'u.nombre',
        'u.email',
        'u.rol',
        db.raw("COALESCE(cu.nombre, '—') as unidad_nombre"),
      )
      .where('u.activo', true);

    // Filtrar por unidad_id si se proporciona
    if (req.query.unidad_id) {
      query = query.where('u.unidad_id', Number(req.query.unidad_id));
    }

    const usuarios = await query.orderBy('u.nombre', 'asc');

    res.json({ data: usuarios });
  } catch (err) { next(err); }
}
