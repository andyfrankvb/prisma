/**
 * Unit Tests: isValidTransition(), isVencida(), isProximaAVencer()
 * File: src/tests/unit/eventos.utils.test.ts
 *
 * Tests the pure utility functions exported from eventos.types.ts.
 *
 * Runner: Vitest
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isValidTransition,
  isVencida,
  isProximaAVencer,
  type EstadoTarea,
} from '../../modules/eventos/eventos.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns an ISO date string (YYYY-MM-DD) N days from today, using local time */
function daysFromToday(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── isValidTransition ─────────────────────────────────────────────────────────

describe('isValidTransition()', () => {
  // ── Transiciones válidas ─────────────────────────────────────

  it('PENDIENTE → EN_PROGRESO es válida', () => {
    expect(isValidTransition('PENDIENTE', 'EN_PROGRESO')).toBe(true);
  });

  it('EN_PROGRESO → COMPLETADA es válida', () => {
    expect(isValidTransition('EN_PROGRESO', 'COMPLETADA')).toBe(true);
  });

  // ── Transiciones inválidas ───────────────────────────────────

  it('PENDIENTE → COMPLETADA es inválida (salto de estado)', () => {
    expect(isValidTransition('PENDIENTE', 'COMPLETADA')).toBe(false);
  });

  it('COMPLETADA → PENDIENTE es inválida (retroceso)', () => {
    expect(isValidTransition('COMPLETADA', 'PENDIENTE')).toBe(false);
  });

  it('COMPLETADA → EN_PROGRESO es inválida (retroceso)', () => {
    expect(isValidTransition('COMPLETADA', 'EN_PROGRESO')).toBe(false);
  });

  it('EN_PROGRESO → PENDIENTE es inválida (retroceso)', () => {
    expect(isValidTransition('EN_PROGRESO', 'PENDIENTE')).toBe(false);
  });

  it('PENDIENTE → PENDIENTE es inválida (mismo estado)', () => {
    expect(isValidTransition('PENDIENTE', 'PENDIENTE')).toBe(false);
  });

  it('EN_PROGRESO → EN_PROGRESO es inválida (mismo estado)', () => {
    expect(isValidTransition('EN_PROGRESO', 'EN_PROGRESO')).toBe(false);
  });

  it('COMPLETADA → COMPLETADA es inválida (mismo estado)', () => {
    expect(isValidTransition('COMPLETADA', 'COMPLETADA')).toBe(false);
  });
});

// ── Property 11: Validez de transiciones de estado de tareas ─────────────────
// Validates: Requirements 10.1, 10.2, 10.3

describe('Property 11: Validez de transiciones de estado de tareas', () => {
  /**
   * **Validates: Requirements 10.1, 10.2, 10.3**
   *
   * Para cualquier par (actual, nuevo) de estados, isValidTransition devuelve
   * true SOLO para PENDIENTE→EN_PROGRESO y EN_PROGRESO→COMPLETADA.
   * Cualquier otra combinación debe devolver false.
   */
  it('solo acepta PENDIENTE→EN_PROGRESO y EN_PROGRESO→COMPLETADA', () => {
    const VALID_PAIRS = new Set([
      'PENDIENTE→EN_PROGRESO',
      'EN_PROGRESO→COMPLETADA',
    ]);

    fc.assert(
      fc.property(
        fc.constantFrom('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA' as EstadoTarea),
        fc.constantFrom('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA' as EstadoTarea),
        (actual, nuevo) => {
          const result = isValidTransition(actual, nuevo);
          const key = `${actual}→${nuevo}`;
          if (VALID_PAIRS.has(key)) {
            return result === true;
          } else {
            return result === false;
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── isVencida ─────────────────────────────────────────────────────────────────

describe('isVencida()', () => {
  // ── Tarea vencida ────────────────────────────────────────────

  it('tarea con fecha pasada y estado PENDIENTE → vencida', () => {
    expect(isVencida(daysFromToday(-1), 'PENDIENTE')).toBe(true);
  });

  it('tarea con fecha pasada y estado EN_PROGRESO → vencida', () => {
    expect(isVencida(daysFromToday(-3), 'EN_PROGRESO')).toBe(true);
  });

  // ── Tarea COMPLETADA nunca está vencida ──────────────────────

  it('tarea COMPLETADA con fecha pasada → no vencida', () => {
    expect(isVencida(daysFromToday(-1), 'COMPLETADA')).toBe(false);
  });

  it('tarea COMPLETADA con fecha muy pasada → no vencida', () => {
    expect(isVencida(daysFromToday(-30), 'COMPLETADA')).toBe(false);
  });

  // ── Tarea con fecha futura → no vencida ─────────────────────

  it('tarea con fecha futura y estado PENDIENTE → no vencida', () => {
    expect(isVencida(daysFromToday(5), 'PENDIENTE')).toBe(false);
  });

  it('tarea con fecha futura y estado EN_PROGRESO → no vencida', () => {
    expect(isVencida(daysFromToday(2), 'EN_PROGRESO')).toBe(false);
  });

  // ── Tarea con fecha de hoy → no vencida (hoy no es pasado) ──

  it('tarea con fecha de hoy y estado PENDIENTE → no vencida', () => {
    expect(isVencida(daysFromToday(0), 'PENDIENTE')).toBe(false);
  });
});

// ── isProximaAVencer ──────────────────────────────────────────────────────────

describe('isProximaAVencer()', () => {
  // ── Próxima a vencer ─────────────────────────────────────────

  it('tarea con fecha en 2 días y estado PENDIENTE → próxima a vencer', () => {
    expect(isProximaAVencer(daysFromToday(2), 'PENDIENTE')).toBe(true);
  });

  it('tarea con fecha en 2 días y estado EN_PROGRESO → próxima a vencer', () => {
    expect(isProximaAVencer(daysFromToday(2), 'EN_PROGRESO')).toBe(true);
  });

  it('tarea con fecha de hoy y estado PENDIENTE → próxima a vencer', () => {
    expect(isProximaAVencer(daysFromToday(0), 'PENDIENTE')).toBe(true);
  });

  it('tarea con fecha en exactamente 3 días y estado PENDIENTE → próxima a vencer', () => {
    expect(isProximaAVencer(daysFromToday(3), 'PENDIENTE')).toBe(true);
  });

  // ── Tarea COMPLETADA nunca está próxima a vencer ─────────────

  it('tarea COMPLETADA con fecha en 2 días → no próxima a vencer', () => {
    expect(isProximaAVencer(daysFromToday(2), 'COMPLETADA')).toBe(false);
  });

  it('tarea COMPLETADA con fecha de hoy → no próxima a vencer', () => {
    expect(isProximaAVencer(daysFromToday(0), 'COMPLETADA')).toBe(false);
  });

  // ── Tarea con fecha lejana → no próxima a vencer ─────────────

  it('tarea con fecha en 5 días y estado PENDIENTE → no próxima a vencer', () => {
    expect(isProximaAVencer(daysFromToday(5), 'PENDIENTE')).toBe(false);
  });

  it('tarea con fecha en 4 días y estado EN_PROGRESO → no próxima a vencer', () => {
    expect(isProximaAVencer(daysFromToday(4), 'EN_PROGRESO')).toBe(false);
  });

  // ── Tarea vencida (fecha pasada) → no próxima a vencer ───────

  it('tarea con fecha pasada y estado PENDIENTE → no próxima a vencer', () => {
    expect(isProximaAVencer(daysFromToday(-1), 'PENDIENTE')).toBe(false);
  });
});
