/**
 * Worker entry point — Notification Service
 * File: src/worker/index.ts
 *
 * Proceso independiente que corre el scheduler de vencimientos.
 * Se ejecuta en el contenedor app_worker, separado de la API.
 *
 * Responsabilidades:
 *  - Cron diario a las 00:00 → revisa vencimientos y envía alertas
 *  - Reconexión automática a DB y Redis si se pierden
 */

import { validateWorkerEnv } from '../utils/env';
validateWorkerEnv();

import { startDeadlineScheduler, runDeadlineCheck } from '../notifications/deadline.scheduler';
import { workerLogger as logger } from '../utils/logger';
import { db } from '../db';

async function start(): Promise<void> {
  logger.info('Iniciando servicio de notificaciones…');

  try {
    await db.raw('SELECT 1');
    logger.info('Conexión a base de datos establecida');
  } catch (err: any) {
    logger.error({ err }, 'No se pudo conectar a la base de datos');
    process.exit(1);
  }

  startDeadlineScheduler();

  if (process.env.RUN_ON_START === 'true') {
    logger.info('Ejecutando verificación inicial de vencimientos…');
    await runDeadlineCheck();
  }

  logger.info('Worker activo. Esperando próxima ejecución del cron.');

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM recibido. Cerrando conexiones…');
    await db.destroy();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT recibido. Cerrando conexiones…');
    await db.destroy();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Error no capturado');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Promise rechazada sin manejar');
  });
}

start();
