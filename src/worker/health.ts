/**
 * Worker health check
 * File: src/worker/health.ts
 *
 * Usado por el HEALTHCHECK del Dockerfile:
 *   CMD node -e "require('./dist/worker/health').check()"
 *
 * Verifica que la DB responda. Si falla, sale con código 1
 * y Docker marca el contenedor como unhealthy.
 */

import { db } from '../db';

export async function check(): Promise<void> {
  try {
    await db.raw('SELECT 1');
    await db.destroy();
    process.exit(0);
  } catch (err: any) {
    console.error('[Worker:health] DB check failed:', err.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
check();
