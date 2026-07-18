/**
 * Unit Tests: calculate_deadline_color()
 * File: src/tests/unit/deadline.utils.test.ts
 *
 * Tests the traffic-light color logic used by TerminoTimer, TrafficDot,
 * and the deadline scheduler.
 *
 * Runner: Jest (or Vitest — API is compatible)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calcDiasRestantes,
  getDeadlineColor,
  getDeadlineColorFromFecha,
} from '../../utils/deadline.utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns an ISO date string N days from today (midnight local) */
function daysFromToday(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ── calcDiasRestantes ─────────────────────────────────────────────────────────

describe('calcDiasRestantes()', () => {
  it('returns null when fecha is null', () => {
    expect(calcDiasRestantes(null)).toBeNull();
  });

  it('returns null when fecha is undefined', () => {
    expect(calcDiasRestantes(undefined)).toBeNull();
  });

  it('returns 0 when fecha is today', () => {
    expect(calcDiasRestantes(daysFromToday(0))).toBe(0);
  });

  it('returns 1 when fecha is tomorrow', () => {
    expect(calcDiasRestantes(daysFromToday(1))).toBe(1);
  });

  it('returns 3 when fecha is 3 days from now', () => {
    expect(calcDiasRestantes(daysFromToday(3))).toBe(3);
  });

  it('returns negative value when fecha is in the past', () => {
    const result = calcDiasRestantes(daysFromToday(-2));
    expect(result).toBe(-2);
  });

  it('returns positive value for a future date', () => {
    const result = calcDiasRestantes(daysFromToday(10));
    expect(result).toBe(10);
  });
});

// ── getDeadlineColor ──────────────────────────────────────────────────────────

describe('getDeadlineColor()', () => {
  // ── GREEN cases ─────────────────────────────────────────────

  it('returns GREEN when tiene_termino is false regardless of dias', () => {
    expect(getDeadlineColor(false, 0)).toBe('GREEN');
    expect(getDeadlineColor(false, -5)).toBe('GREEN');
    expect(getDeadlineColor(false, 100)).toBe('GREEN');
  });

  it('returns GREEN when dias is null (no fecha set)', () => {
    expect(getDeadlineColor(true, null)).toBe('GREEN');
  });

  it('returns GREEN when dias > 3', () => {
    expect(getDeadlineColor(true, 4)).toBe('GREEN');
    expect(getDeadlineColor(true, 30)).toBe('GREEN');
  });

  // ── YELLOW cases ────────────────────────────────────────────

  it('returns YELLOW when dias is exactly 3', () => {
    expect(getDeadlineColor(true, 3)).toBe('YELLOW');
  });

  it('returns YELLOW when dias is 2', () => {
    expect(getDeadlineColor(true, 2)).toBe('YELLOW');
  });

  // ── RED cases ───────────────────────────────────────────────

  it('returns RED when dias is exactly 1 (less than 24 hours)', () => {
    expect(getDeadlineColor(true, 1)).toBe('RED');
  });

  it('returns RED when dias is 0 (vence hoy)', () => {
    expect(getDeadlineColor(true, 0)).toBe('RED');
  });

  it('returns RED when dias is negative (already overdue)', () => {
    expect(getDeadlineColor(true, -1)).toBe('RED');
    expect(getDeadlineColor(true, -30)).toBe('RED');
  });
});

// ── getDeadlineColorFromFecha ─────────────────────────────────────────────────

describe('getDeadlineColorFromFecha()', () => {
  it('returns RED for a fecha that is tomorrow (< 24 h remaining)', () => {
    expect(getDeadlineColorFromFecha(true, daysFromToday(1))).toBe('RED');
  });

  it('returns RED for a fecha that is today', () => {
    expect(getDeadlineColorFromFecha(true, daysFromToday(0))).toBe('RED');
  });

  it('returns RED for a fecha already passed', () => {
    expect(getDeadlineColorFromFecha(true, daysFromToday(-3))).toBe('RED');
  });

  it('returns YELLOW for a fecha 2 days away', () => {
    expect(getDeadlineColorFromFecha(true, daysFromToday(2))).toBe('YELLOW');
  });

  it('returns YELLOW for a fecha exactly 3 days away', () => {
    expect(getDeadlineColorFromFecha(true, daysFromToday(3))).toBe('YELLOW');
  });

  it('returns GREEN for a fecha 4+ days away', () => {
    expect(getDeadlineColorFromFecha(true, daysFromToday(4))).toBe('GREEN');
  });

  it('returns GREEN when tiene_termino is false even if fecha is past', () => {
    expect(getDeadlineColorFromFecha(false, daysFromToday(-10))).toBe('GREEN');
  });

  it('returns GREEN when fecha is null', () => {
    expect(getDeadlineColorFromFecha(true, null)).toBe('GREEN');
  });
});
