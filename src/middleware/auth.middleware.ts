/**
 * Auth middleware — JWT verification
 * File: src/middleware/auth.middleware.ts
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { AppError } from '../utils/AppError';

/**
 * Lo único que se puede hacer con la contraseña puesta por un tercero.
 *
 * Se compara contra `originalUrl` y no contra `req.path` porque este middleware se
 * monta en routers distintos, y ahí `req.path` llega ya recortado por el prefijo.
 */
const CAMBIO_DE_PASSWORD = '/api/v1/usuarios/mi-password';

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Token requerido', 401));
  }

  let payload: any;
  try {
    const token  = header.slice(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) return next(new AppError('Configuración de servidor inválida', 500));
    payload = jwt.verify(token, secret);
  } catch {
    return next(new AppError('Token inválido o expirado', 401));
  }

  /**
   * El token, por sí solo, ya no basta.
   *
   * Un JWT dice lo que era verdad cuando se firmó y dura 8 horas sin que nadie lo
   * vuelva a mirar. Eso dejaba dos huecos: dar de baja a alguien no lo sacaba del
   * sistema, y restablecer una contraseña tampoco —si el motivo era que alguien
   * había entrado sin permiso, esa persona seguía dentro hasta 8 horas más—.
   *
   * Se resuelve con una consulta por llave primaria a tres columnas. Es barata, y
   * a cambio el estado de la cuenta manda sobre el papel que trae el portador.
   */
  try {
    const cuenta = await db('usuarios')
      .where({ id: payload.id })
      .select('activo', 'password_debe_cambiar', 'password_cambiada_en')
      .first();

    if (!cuenta) return next(new AppError('Token inválido o expirado', 401));
    if (cuenta.activo === false) {
      return next(new AppError('Usuario inactivo. Contacta al administrador.', 403));
    }

    /**
     * Sesiones anteriores al último cambio de contraseña: fuera.
     *
     * La comparación va al segundo y no al milisegundo a propósito. El `iat` de un
     * JWT se guarda en segundos enteros, así que un token firmado a las 10:00:00.9
     * dice 10:00:00; si la contraseña quedó registrada a las 10:00:00.4, comparar
     * con más precisión invalidaría el token recién emitido y el usuario entraría
     * para ser expulsado en el acto.
     */
    if (cuenta.password_cambiada_en && typeof payload.iat === 'number') {
      const cambiada = Math.floor(new Date(cuenta.password_cambiada_en).getTime() / 1000);
      if (payload.iat < cambiada) {
        return next(new AppError('Tu contraseña cambió. Vuelve a iniciar sesión.', 401));
      }
    }

    // Con una contraseña que puso alguien más, lo único permitido es cambiarla.
    if (cuenta.password_debe_cambiar && req.originalUrl.split('?')[0] !== CAMBIO_DE_PASSWORD) {
      return next(new AppError(
        'Debes cambiar tu contraseña antes de usar el sistema.',
        403,
      ));
    }

    (req as any).user = payload;
    (req as any).debeCambiarPassword = Boolean(cuenta.password_debe_cambiar);
    next();
  } catch (err) {
    next(err);
  }
}
