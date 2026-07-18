/**
 * Auth middleware — JWT verification
 * File: src/middleware/auth.middleware.ts
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Token requerido', 401));
  }
  try {
    const token   = header.slice(7);
    const secret  = process.env.JWT_SECRET;
    if (!secret) return next(new AppError('Configuración de servidor inválida', 500));
    const payload = jwt.verify(token, secret) as any;
    (req as any).user = payload;
    next();
  } catch {
    next(new AppError('Token inválido o expirado', 401));
  }
}
