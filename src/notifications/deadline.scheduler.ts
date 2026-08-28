/**
 * Scheduler: Deadline Checker
 * File: src/notifications/deadline.scheduler.ts
 *
 * Cron: '0 0 * * *'  →  runs every day at 00:00 server time
 *
 * Checks all active oficios with a deadline and dispatches:
 *  - DEADLINE_1_DAY   : fecha_vencimiento is exactly tomorrow
 *  - DEADLINE_OVERDUE : fecha_vencimiento is today or in the past
 *
 * Uses 'node-cron' (lightweight, no external daemon required).
 * Install: npm install node-cron
 *          npm install -D @types/node-cron
 */

import cron from 'node-cron';
import { db } from '../db';
import { logger } from '../utils/logger';
import {
  notifyDeadline1Day,
  notifyDeadlineOverdue,
} from './notification.dispatcher';
import { revisarSolicitudesDemoradas } from './solicitudes.scheduler';

// ── Query helpers ─────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ['RECIBIDO', 'ASIGNADO', 'EN_REVISION', 'VOBO_APROBADO'];

interface OficioDeadlineRow {
  id:                 number;
  folio:              string;
  dependencia_origen: string;
  fecha_vencimiento:  string;
}

async function getOficiosVencenManana(): Promise<OficioDeadlineRow[]> {
  // Use DB-side date arithmetic to avoid timezone drift
  return db('oficios')
    .whereIn('estatus', ACTIVE_STATUSES)
    .andWhere('tiene_termino', true)
    .andWhereRaw(`fecha_vencimiento::date = (CURRENT_DATE + INTERVAL '1 day')::date`)
    .select('id', 'folio', 'dependencia_origen', 'fecha_vencimiento');
}

async function getOficiosVencidos(): Promise<OficioDeadlineRow[]> {
  return db('oficios')
    .whereIn('estatus', ACTIVE_STATUSES)
    .andWhere('tiene_termino', true)
    .andWhereRaw(`fecha_vencimiento::date <= CURRENT_DATE`)
    .select('id', 'folio', 'dependencia_origen', 'fecha_vencimiento');
}

// ── Main task ─────────────────────────────────────────────────────────────────

export async function runDeadlineCheck(): Promise<void> {
  const startedAt = new Date().toISOString();
  logger.info('Running deadline check');

  try {
    const [vencenManana, vencidos] = await Promise.all([
      getOficiosVencenManana(),
      getOficiosVencidos(),
    ]);

    logger.info(
      { expiring_tomorrow: vencenManana.length, overdue: vencidos.length },
      'Deadline check results',
    );

    const BATCH = 10;

    for (let i = 0; i < vencenManana.length; i += BATCH) {
      await Promise.allSettled(
        vencenManana.slice(i, i + BATCH).map((o) =>
          notifyDeadline1Day(o).catch((err) =>
            logger.error({ err, oficio_id: o.id }, '1-day alert failed'),
          ),
        ),
      );
    }

    for (let i = 0; i < vencidos.length; i += BATCH) {
      await Promise.allSettled(
        vencidos.slice(i, i + BATCH).map((o) =>
          notifyDeadlineOverdue(o).catch((err) =>
            logger.error({ err, oficio_id: o.id }, 'Overdue alert failed'),
          ),
        ),
      );
    }

    // Las solicitudes a otras áreas se revisan en la misma pasada nocturna: son
    // el otro motivo por el que un oficio se queda parado sin que nadie avise.
    await revisarSolicitudesDemoradas();

    const elapsed = Date.now() - new Date(startedAt).getTime();
    logger.info({ elapsed_ms: elapsed }, 'Deadline check completed');
  } catch (err: any) {
    logger.error({ err }, 'Fatal error during deadline check');
  }
}

// ── Register cron job ─────────────────────────────────────────────────────────

/**
 * Call this once during app startup.
 *
 * @example
 *   import { startDeadlineScheduler } from './notifications/deadline.scheduler';
 *   startDeadlineScheduler();
 */
export function startDeadlineScheduler(): void {
  // Validate cron expression before registering
  if (!cron.validate('0 0 * * *')) {
    throw new Error('[DeadlineScheduler] Invalid cron expression');
  }

  cron.schedule(
    '0 0 * * *',
    () => { runDeadlineCheck(); },
    { timezone: process.env.TZ ?? 'America/Cancun' },
  );

  logger.info('Deadline scheduler registered — runs daily at 00:00 (America/Cancun)');
}
