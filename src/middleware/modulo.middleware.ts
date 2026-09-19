/**
 * Módulo middleware — acceso por módulo asignado a la persona
 * File: src/middleware/modulo.middleware.ts
 *
 * Va después de `authenticate`. Es el mismo criterio que `requireModuloSatq` y
 * `requireModuloReportes` en sus controllers, pero a nivel de router: sin la
 * fila en `usuario_modulos` el endpoint no responde, aunque se conozca la URL.
 * El menú solo esconde la tarjeta; esto es lo que de verdad cierra la puerta.
 */
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { AppError } from '../utils/AppError';

export function requireModulo(clave: string, nombre: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user as any;
      if (user?.rol === 'SUPERADMIN') return next();

      const row = await db('usuario_modulos as um')
        .join('modulos as m', 'm.id', 'um.modulo_id')
        .where('um.usuario_id', user?.id)
        .andWhere('m.clave', clave)
        .andWhere('m.activo', true)
        .first();

      if (!row) return next(new AppError(`Acceso restringido: módulo "${nombre}" no habilitado`, 403));
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Solo SUPERADMIN — para catálogos sin módulo propio que no cualquiera debe editar. */
export function requireSuperadmin(req: Request, _res: Response, next: NextFunction): void {
  if ((req.user as any)?.rol !== 'SUPERADMIN') {
    return next(new AppError('Acceso restringido: se requiere rol de administrador', 403));
  }
  next();
}
