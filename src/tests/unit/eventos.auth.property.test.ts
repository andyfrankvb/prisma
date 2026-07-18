/**
 * Property-Based Tests: Eventos — Autorización de actualización de tareas
 * File: src/tests/unit/eventos.auth.property.test.ts
 *
 * **Property 12: Autorización de actualización de tareas**
 * **Validates: Requirements 10.4**
 *
 * Para cualquier tarea asignada al usuario A, un usuario B distinto de A que
 * intente actualizar el estado de esa tarea debe recibir HTTP 403,
 * independientemente del estado actual de la tarea o la transición solicitada.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Request, Response, NextFunction } from 'express';

// ── Mock bcrypt (native module — must be mocked before any controller import) ─

vi.mock('bcrypt', () => ({
  default: {
    hash:    vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

// ── Mock AppError ─────────────────────────────────────────────────────────────

vi.mock('../../utils/AppError', () => ({
  AppError: class AppError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

// ── Mock notification dispatcher ──────────────────────────────────────────────

vi.mock('../../notifications/notification.dispatcher', () => ({
  notifyEventoTarea: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock logger ───────────────────────────────────────────────────────────────

vi.mock('../../utils/logger', () => ({
  logger: {
    info:  vi.fn(),
    error: vi.fn(),
    warn:  vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Shared mock state for db ──────────────────────────────────────────────────
//
// actualizarEstadoTarea calls:
//   db('tareas_evento').where({ id: tareaId }).first()
//
// We configure the mock to return a task with asignado_a_id = 999 (fixed).
// The test generates user IDs different from 999 and verifies HTTP 403.

let mockTareaResult: any = null;

const makeTareaChain = () => {
  const chain: any = {
    select:  vi.fn().mockReturnThis(),
    where:   vi.fn().mockReturnThis(),
    update:  vi.fn().mockReturnThis(),
    first:   vi.fn().mockImplementation(() => Promise.resolve(mockTareaResult)),
    returning: vi.fn().mockResolvedValue([]),
  };
  return chain;
};

vi.mock('../../db', () => {
  const mockDbFn: any = vi.fn((_table: string) => makeTareaChain());
  mockDbFn.raw = vi.fn((expr: string) => expr);
  mockDbFn.fn  = { now: vi.fn(() => new Date()) };
  return { db: mockDbFn };
});

// ── Import controller and AppError AFTER vi.mock() calls ──────────────────────

import { actualizarEstadoTarea } from '../../modules/eventos/eventos.controller';
import { AppError } from '../../utils/AppError';
import { db as mockDb } from '../../db';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

// ── Property 12: Autorización de actualización de tareas ─────────────────────

describe('actualizarEstadoTarea() — Property 12: Autorización de actualización de tareas', () => {
  // The task is always assigned to user 999
  const ASSIGNED_USER_ID = 999;

  beforeEach(() => {
    vi.clearAllMocks();

    // Restore db mock after clearAllMocks
    (mockDb as any).mockImplementation((_table: string) => makeTareaChain());
    (mockDb as any).raw = vi.fn((expr: string) => expr);
    (mockDb as any).fn  = { now: vi.fn(() => new Date()) };

    // Default task: assigned to ASSIGNED_USER_ID, in PENDIENTE state
    mockTareaResult = {
      id:                  1,
      evento_id:           10,
      titulo:              'Tarea de prueba',
      descripcion:         null,
      asignado_a_id:       ASSIGNED_USER_ID,
      estado:              'PENDIENTE',
      fecha_programada:    '2025-12-31',
      fecha_actualizacion: new Date().toISOString(),
    };
  });

  it(
    'devuelve HTTP 403 cuando el usuario autenticado no es el asignado a la tarea',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate user IDs different from ASSIGNED_USER_ID (999)
          fc.integer({ min: 1, max: 1000 }).filter((id) => id !== ASSIGNED_USER_ID),
          async (requestingUserId) => {
            // Configure mock to return the task assigned to ASSIGNED_USER_ID
            (mockDb as any).mockImplementation((_table: string) => {
              const chain = makeTareaChain();
              // Override first() to return the fixed task
              chain.first.mockResolvedValue({
                id:                  1,
                evento_id:           10,
                titulo:              'Tarea de prueba',
                descripcion:         null,
                asignado_a_id:       ASSIGNED_USER_ID,
                estado:              'PENDIENTE',
                fecha_programada:    '2025-12-31',
                fecha_actualizacion: new Date().toISOString(),
              });
              return chain;
            });
            (mockDb as any).raw = vi.fn((expr: string) => expr);
            (mockDb as any).fn  = { now: vi.fn(() => new Date()) };

            // Build request with a user ID different from the assigned user
            const req: Partial<Request> = {
              params: { id: '10', tareaId: '1' },
              user: {
                id:         requestingUserId,
                nombre:     `Usuario ${requestingUserId}`,
                email:      `user${requestingUserId}@test.mx`,
                rol:        'DIRECTOR',
                oficina_id: 2,
              } as any,
              body: { estado: 'EN_PROGRESO' },
              query: {},
            } as any;

            const res  = makeRes();
            const next = vi.fn();

            await actualizarEstadoTarea(
              req as Request,
              res as unknown as Response,
              next as NextFunction,
            );

            // next() must have been called with an AppError of statusCode 403
            expect(next).toHaveBeenCalledOnce();
            const err = next.mock.calls[0][0];
            expect(err).toBeInstanceOf(AppError);
            expect((err as AppError).statusCode).toBe(403);

            // res.json must NOT have been called (no successful response)
            expect(res.json).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
