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
    const { rol, oficina_id, search, activo, modulo } = req.query;

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
    // Filtrar por el módulo que tienen habilitado: es la forma de ver de un
    // vistazo quién trabaja cada tipo de información.
    if (modulo) {
      query = query.whereExists(function () {
        this.select('*')
          .from('usuario_modulos as um')
          .join('modulos as m', 'm.id', 'um.modulo_id')
          .whereRaw('um.usuario_id = u.id')
          .andWhere('m.clave', String(modulo));
      });
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
  esRolPorUnidad,
  esRolGlobal,
  admiteVariosPorUnidad,
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
          // Cómo se llama en pantalla. El identificador guardado no cambia
          // —migrarlo obligaría a tocar cada lugar que lo consulta—, pero
          // «SECRETARIA» nombraba un puesto y no la función que ejerce.
          nombre_visible:       rule?.nombreVisible ?? rol,
          por_unidad:           esRolPorUnidad(modulo.clave, rol) || cfgs.some((c: any) => c.unidad_id !== null),
          // Admite varias personas. Cuando además no es por unidad —la carga del
          // firmado— se agregan sin elegir área.
          admite_varios:        admiteVariosPorUnidad(modulo.clave, rol),
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

    // Rol global (un solo usuario, sin unidad): p.ej. SECRETARIA en oficialía.
    const rolEsGlobal = esRolGlobal(moduloClave, rolFlujo);
    const unidadIdVal = (unidad_id && !rolEsGlobal) ? Number(unidad_id) : null;

    // Si es rol global y se intenta pasar unidad_id, rechazar
    if (rolEsGlobal && unidad_id) {
      throw new AppError(`El rol '${rolFlujo}' solo admite un usuario global, sin filtro por unidad`, 422);
    }

    // Roles por unidad (OFICIAL, ENCARGADO): exigen delegación. Sin unidad,
    // el upsert crearía filas NULL duplicadas (NULLS DISTINCT).
    if (esRolPorUnidad(moduloClave, rolFlujo) && !unidadIdVal) {
      throw new AppError(`El rol '${rolFlujo}' requiere seleccionar una delegación`, 422);
    }

    // Roles que admiten varios actores por unidad (hoy: OFICIAL) se AGREGAN;
    // el resto se REEMPLAZA, porque debe haber uno solo por unidad.
    const varios = admiteVariosPorUnidad(moduloClave, rolFlujo);

    await db.transaction(async (trx) => {
      const anterior = varios
        ? null
        : await trx('configuracion_flujos')
            .where({ modulo_clave: moduloClave, rol_flujo: rolFlujo, unidad_id: unidadIdVal })
            .select('usuario_id')
            .first();

      const fila = {
        modulo_clave:       moduloClave,
        rol_flujo:          rolFlujo,
        usuario_id:         Number(usuario_id),
        unidad_id:          unidadIdVal,
        actualizado_por_id: requester.id,
        actualizado_en:     new Date(),
      };

      // Nota: los índices únicos son PARCIALES (uno para OFICIAL y otro para el
      // resto), y Postgres no acepta ON CONFLICT contra un índice parcial sin
      // repetir su predicado. Por eso se consulta antes de insertar.
      if (varios) {
        // Se suma a los que ya existan; si esa persona ya estaba, solo se refresca.
        const yaEsta = await trx('configuracion_flujos')
          .where({ modulo_clave: moduloClave, rol_flujo: rolFlujo, unidad_id: unidadIdVal, usuario_id: Number(usuario_id) })
          .first();
        if (yaEsta) {
          await trx('configuracion_flujos').where({ id: yaEsta.id })
            .update({ actualizado_por_id: requester.id, actualizado_en: new Date() });
        } else {
          await trx('configuracion_flujos').insert(fila);
        }
      } else if (anterior) {
        // Rol único por unidad: se reemplaza al actor anterior.
        await trx('configuracion_flujos')
          .where({ modulo_clave: moduloClave, rol_flujo: rolFlujo, unidad_id: unidadIdVal })
          .update({ usuario_id: Number(usuario_id), actualizado_por_id: requester.id, actualizado_en: new Date() });
      } else {
        await trx('configuracion_flujos').insert(fila);
      }

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
    // En los roles que admiten varios por unidad (OFICIAL) hay que borrar SOLO a la
    // persona indicada; sin `usuario_id` se llevaría a todos los de esa delegación.
    const usuarioId = req.query.usuario_id ? Number(req.query.usuario_id) : null;

    let q = db('configuracion_flujos')
      .where({ modulo_clave: modulo, rol_flujo: rol, unidad_id: Number(unidadId) });
    if (usuarioId) q = q.andWhere({ usuario_id: usuarioId });

    const deleted = await q.delete();
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

    // No filtrar por unidad: el ENCARGADO es un rol funcional asignado a una persona,
    // independientemente de en cuál área esté registrada. Así Oscar Gopar (Jurídica)
    // puede ser ENCARGADO de Dirección General.
    const usuarios = await query.orderBy('u.nombre', 'asc');

    res.json({ data: usuarios });
  } catch (err) { next(err); }
}

// ── VoBo por delegación ───────────────────────────────────────

/**
 * Lista las delegaciones con su configuración de VoBo (DELEGADO/ENCARGADO),
 * junto al delegado y al encargado configurado, para el panel de Flujos.
 */
export async function listarDelegacionesVobo(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Delegaciones y direcciones de área: ambas eligen quién aprueba. La
    // Dirección General queda fuera a propósito —el visto bueno del flujo es
    // siempre de su encargado, sobre el trabajo de su equipo—. Lo de la Directora
    // General es la firma: aprobar o regresar lo que él le manda terminado.
    const delegaciones = await db('catalogo_unidades as cu')
      .whereIn('cu.tipo', ['DELEGACION', 'DIRECCION'])
      .leftJoin('usuarios as d', function () {
        this.on('d.unidad_id', '=', 'cu.id').andOnVal('d.rol', '=', 'DIRECTOR');
      })
      .leftJoin('configuracion_flujos as cf', function () {
        this.on('cf.unidad_id', '=', 'cu.id')
            .andOnVal('cf.modulo_clave', '=', 'oficialia_partes')
            .andOnVal('cf.rol_flujo', '=', 'ENCARGADO');
      })
      .leftJoin('usuarios as e', 'e.id', 'cf.usuario_id')
      .select(
        'cu.id',
        'cu.nombre',
        'cu.tipo',            // define la etiqueta del titular: Delegado o Director
        'cu.vobo_por',
        'cu.recibe_direcciones_area',
        'd.nombre as delegado_nombre',
        'e.nombre as encargado_nombre',
      )
      .orderBy('cu.tipo', 'asc')
      .orderBy('cu.nombre', 'asc');
    res.json({ data: delegaciones });
  } catch (err) {
    next(err);
  }
}

/** Cambia quién da el VoBo en una delegación (DELEGADO o ENCARGADO). */
export async function actualizarDelegacionVobo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const unidadId = parseInt(req.params.unidadId, 10);

    // Solo las unidades con flujo propio (delegaciones y direcciones de área) tienen
    // esta configuración; la Dirección General queda fuera a propósito.
    const unidad = await db('catalogo_unidades')
      .where({ id: unidadId })
      .whereIn('tipo', ['DELEGACION', 'DIRECCION'])
      .first();
    if (!unidad) throw new AppError('Unidad no encontrada o sin configuración propia', 404);

    const cambios: Record<string, unknown> = {};

    if (req.body?.vobo_por !== undefined) {
      const vobo_por = String(req.body.vobo_por).toUpperCase();
      if (!['DELEGADO', 'ENCARGADO'].includes(vobo_por)) {
        throw new AppError('vobo_por debe ser DELEGADO o ENCARGADO', 422);
      }
      cambios.vobo_por = vobo_por;
    }

    // A qué áreas puede dirigir oficios esta delegación al registrarlos.
    if (req.body?.recibe_direcciones_area !== undefined) {
      if (unidad.tipo !== 'DELEGACION') {
        throw new AppError('Esta opción solo aplica a delegaciones', 422);
      }
      cambios.recibe_direcciones_area =
        req.body.recibe_direcciones_area === true || req.body.recibe_direcciones_area === 'true';
    }

    if (!Object.keys(cambios).length) throw new AppError('No hay cambios que aplicar', 422);

    await db('catalogo_unidades').where({ id: unidadId }).update(cambios);
    res.json({ message: 'Configuración actualizada', data: { id: unidadId, ...cambios } });
  } catch (err) {
    next(err);
  }
}

// ── Destinos entre áreas ──────────────────────────────────────
/**
 * GET /admin/destinos
 *
 * La matriz de qué área puede dirigirse a qué área. Antes esto vivía en el
 * código y en dos lugares que no coincidían, así que cambiarlo obligaba a tocar
 * el programa; ahora se ve y se ajusta aquí.
 *
 * Se devuelve la matriz completa —todas las combinaciones, con su `permitido`
 * ya resuelto— y no solo las excepciones guardadas: la pantalla necesita pintar
 * cada casilla, y hacerle deducir el valor por omisión sería repetir del lado
 * del navegador una regla que ya vive en la base.
 */
export async function listarDestinos(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const unidades = await db('catalogo_unidades')
      .where('activo', true)
      .select('id', 'nombre', 'tipo')
      .orderByRaw(`CASE tipo
                     WHEN 'DIRECCION_GENERAL' THEN 0
                     WHEN 'DIRECCION'         THEN 1
                     ELSE 2 END`)
      .orderBy('nombre', 'asc');

    const vetados = await db('configuracion_destinos')
      .where('permitido', false)
      .select('unidad_origen_id', 'unidad_destino_id');
    const vetado = new Set(vetados.map((v: any) => `${v.unidad_origen_id}:${v.unidad_destino_id}`));

    const matriz = unidades.flatMap((origen: any) =>
      unidades
        .filter((destino: any) => destino.id !== origen.id)
        .map((destino: any) => ({
          unidad_origen_id:  origen.id,
          unidad_destino_id: destino.id,
          permitido:         !vetado.has(`${origen.id}:${destino.id}`),
        })),
    );

    res.json({ data: { unidades, matriz } });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /admin/destinos/:origenId/:destinoId
 *
 * Prende o apaga una casilla. Se guarda el renglón en ambos casos —aunque
 * `permitido: true` sea el valor por omisión— para dejar constancia de quién lo
 * cambió y cuándo: al revisar por qué un área ve lo que ve, importa distinguir
 * lo que nadie ha tocado de lo que alguien devolvió a su lugar.
 */
export async function actualizarDestino(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const origenId  = parseInt(req.params.origenId, 10);
    const destinoId = parseInt(req.params.destinoId, 10);
    if (!origenId || !destinoId) throw new AppError('Faltan las áreas', 422);
    if (origenId === destinoId)  throw new AppError('Un área no se turna a sí misma', 422);

    const existen = await db('catalogo_unidades')
      .whereIn('id', [origenId, destinoId])
      .andWhere('activo', true)
      .count('id as n')
      .first();
    if (Number((existen as any)?.n ?? 0) !== 2) {
      throw new AppError('Alguna de las áreas no existe o está inactiva', 422);
    }

    const permitido = req.body?.permitido === true || req.body?.permitido === 'true';

    await db('configuracion_destinos')
      .insert({
        unidad_origen_id:   origenId,
        unidad_destino_id:  destinoId,
        permitido,
        actualizado_en:     new Date(),
        actualizado_por_id: req.user?.id ?? null,
      })
      .onConflict(['unidad_origen_id', 'unidad_destino_id'])
      .merge(['permitido', 'actualizado_en', 'actualizado_por_id']);

    res.json({
      message: permitido ? 'Destino habilitado' : 'Destino deshabilitado',
      data: { unidad_origen_id: origenId, unidad_destino_id: destinoId, permitido },
    });
  } catch (err) {
    next(err);
  }
}
