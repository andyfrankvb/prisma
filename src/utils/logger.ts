/**
 * Logger: pino — structured JSON logging
 * File: src/utils/logger.ts
 *
 * Uso:
 *   import { logger } from './utils/logger';
 *   logger.info({ userId: 1 }, 'Usuario autenticado');
 *   logger.error({ err }, 'Error al procesar oficio');
 *
 * En desarrollo imprime pretty-print con colores.
 * En producción emite JSON puro (compatible con CloudWatch, Datadog, etc.)
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),

  // Pretty print solo en desarrollo (no en tests para evitar problemas con SharedArrayBuffer)
  ...(isDev && !isTest && {
    transport: {
      target:  'pino-pretty',
      options: {
        colorize:        true,
        translateTime:   'SYS:HH:MM:ss',
        ignore:          'pid,hostname',
        messageFormat:   '{msg}',
      },
    },
  }),

  // Campos base en todos los logs
  base: {
    service: 'oficialia-partes-api',
    env:     process.env.NODE_ENV ?? 'development',
  },

  // Serializar errores correctamente
  serializers: {
    err:   pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req:   pino.stdSerializers.req,
    res:   pino.stdSerializers.res,
  },
});

/** Logger hijo para el worker */
export const workerLogger = logger.child({ service: 'oficialia-partes-worker' });
