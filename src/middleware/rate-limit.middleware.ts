/**
 * Rate limiting
 * File: src/middleware/rate-limit.middleware.ts
 *
 * Dos límites, para las dos superficies que no los tenían:
 *
 *   · `loginLimiter`   — el inicio de sesión. Sin esto, probar contraseñas es
 *                        gratis e ilimitado.
 *   · `publicoLimiter` — las cinco rutas del QR en Control de Correspondencia,
 *                        que por diseño funcionan SIN sesión.
 *
 * ── Por qué los dos cuentan distinto ──────────────────────────────────────────
 *
 * El del login ignora los intentos exitosos (`skipSuccessfulRequests`). Lo que
 * hay que frenar es adivinar, no trabajar: quien entra bien diez veces en una
 * mañana —porque cambió de computadora o se le cerró la sesión— no consume cuota.
 * Solo cuentan los fallos.
 *
 * ── La advertencia del NAT ────────────────────────────────────────────────────
 *
 * El límite es por IP, y una delegación entera puede salir a internet por una
 * sola IP pública. Si varias personas comparten salida, comparten cuota. Por eso
 * los valores son generosos y se pueden ajustar por variable de entorno sin
 * tocar código: si una oficina se queda fuera, se sube el número y se reinicia,
 * no se espera un despliegue.
 *
 * Requiere `app.set('trust proxy', ...)` en `server.ts`, porque la aplicación
 * corre detrás de nginx y sin eso todas las peticiones se verían con la IP del
 * proxy —una sola— y el límite caería sobre todo el mundo a la vez.
 */

import rateLimit from 'express-rate-limit';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger }   from '../utils/logger';

/** Lee un entero de una variable de entorno, con valor por omisión si falta o no es válida. */
function entero(nombre: string, porOmision: number): number {
  const crudo = process.env[nombre];
  if (!crudo) return porOmision;
  const valor = Number.parseInt(crudo, 10);
  return Number.isInteger(valor) && valor > 0 ? valor : porOmision;
}

const MINUTO = 60 * 1000;

/**
 * Construye el manejador de rechazo: registra el intento y devuelve el error por
 * el canal estándar del proyecto, para que el frontend lo lea como cualquier otro.
 */
function rechazo(mensaje: string, etiqueta: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    logger.warn({ ip: req.ip, ruta: req.originalUrl, limite: etiqueta }, 'Rate limit alcanzado');
    next(new AppError(mensaje, 429));
  };
}

/**
 * Inicio de sesión: estricto, y solo cuenta los fallos.
 * Por omisión, 10 intentos fallidos por IP cada 15 minutos.
 */
export const loginLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: entero('RATE_LIMIT_LOGIN_VENTANA_MIN', 15) * MINUTO,
  limit:    entero('RATE_LIMIT_LOGIN_INTENTOS', 10),
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  handler: rechazo(
    'Demasiados intentos de inicio de sesión. Espera unos minutos e inténtalo de nuevo.',
    'login',
  ),
});

/**
 * Rutas públicas del QR: moderado.
 * Por omisión, 120 peticiones por IP cada 15 minutos — suficiente para una
 * jornada de escaneos, corto para un abuso automatizado.
 */
export const publicoLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: entero('RATE_LIMIT_PUBLICO_VENTANA_MIN', 15) * MINUTO,
  limit:    entero('RATE_LIMIT_PUBLICO_PETICIONES', 120),
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  handler: rechazo(
    'Demasiadas peticiones desde esta conexión. Espera un momento e inténtalo de nuevo.',
    'publico',
  ),
});
