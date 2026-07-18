/**
 * Utility: Deadline color logic (extracted for testability)
 * File: src/utils/deadline.utils.ts
 *
 * These are the same rules used by TerminoTimer and TrafficDot in the frontend,
 * and by the scheduler on the backend — single source of truth.
 */

export type Semaforo = 'RED' | 'YELLOW' | 'GREEN';

/**
 * Calculates whole days remaining between today (midnight) and a deadline date.
 * Returns null when fecha is null/undefined.
 */
export function calcDiasRestantes(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const hoy   = new Date();
  hoy.setHours(0, 0, 0, 0);
  // Parse YYYY-MM-DD as local time (not UTC) to avoid timezone offset issues
  const [y, m, d] = fecha.split('-').map(Number);
  const vence = new Date(y, m - 1, d);
  return Math.ceil((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Returns the traffic-light color for a deadline.
 *
 * Rules:
 *  RED    → tiene_termino && dias_restantes <= 1   (< 24 h or already overdue)
 *  YELLOW → tiene_termino && dias_restantes <= 3
 *  GREEN  → !tiene_termino || dias_restantes > 3
 */
export function getDeadlineColor(
  tiene_termino: boolean,
  dias: number | null,
): Semaforo {
  if (!tiene_termino || dias === null) return 'GREEN';
  if (dias <= 1) return 'RED';
  if (dias <= 3) return 'YELLOW';
  return 'GREEN';
}

/**
 * Convenience: derive color directly from a fecha string.
 */
export function getDeadlineColorFromFecha(
  tiene_termino: boolean,
  fecha_vencimiento: string | null | undefined,
): Semaforo {
  return getDeadlineColor(tiene_termino, calcDiasRestantes(fecha_vencimiento));
}
