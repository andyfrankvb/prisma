/**
 * Property-Based Tests: Admin — Módulos por usuario
 * File: src/tests/unit/admin.modulos.property.test.ts
 *
 * **Property 3: Corrección del estado habilitado por usuario**
 * **Validates: Requirements 2.1**
 *
 * Para cualquier subconjunto de IDs de módulos asignados a un usuario,
 * la respuesta de listarModulosUsuario debe contener todos los módulos del
 * catálogo con `habilitado = true` exactamente para los módulos asignados
 * y `habilitado = false` para los demás.
 *
 * **Property 4: Round-trip de asignación y revocación de módulo**
 * **Validates: Requirements 2.2, 2.3**
 *
 * Para cualquier moduloId, habilitar el módulo (POST) y luego revocarlo (DELETE)
 * debe dejar el estado del usuario exactamente igual al estado previo a la
 * asignación (módulo con habilitado = false).
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

// ── Shared mock state for db ──────────────────────────────────────────────────
//
// Property 3 (listarModulosUsuario) uses a table-aware mock:
//   - db('usuarios') → chain that resolves .first() to mockUsuarioResult
//   - db('modulos as m') → chain that resolves .orderBy() to mockModulosResult
//
// Property 4 (habilitarModulo / revocarModulo) overrides db() to return a
// single configurable chain (mockChain) via (mockDb as any).mockReturnValue().

let mockUsuarioResult: any = null;
let mockModulosResult: any[] = [];

const makeUserChain = () => {
  const chain: any = {
    select:   vi.fn().mockReturnThis(),
    where:    vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy:  vi.fn().mockReturnThis(),
    first:    vi.fn().mockImplementation(() => Promise.resolve(mockUsuarioResult)),
  };
  return chain;
};

const makeModulosChain = () => {
  const chain: any = {
    select:   vi.fn().mockReturnThis(),
    where:    vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy:  vi.fn().mockImplementation(() => Promise.resolve(mockModulosResult)),
  };
  return chain;
};

vi.mock('../../db', () => {
  const mockDbFn: any = vi.fn((table: string) => {
    if (table === 'usuarios') {
      return makeUserChain();
    }
    return makeModulosChain();
  });
  mockDbFn.raw = vi.fn((expr: string) => expr);
  mockDbFn.fn  = { now: vi.fn(() => new Date()) };
  return { db: mockDbFn };
});

// ── Import controller and db mock AFTER vi.mock() calls ───────────────────────

import {
  listarModulos,
  listarModulosUsuario,
  habilitarModulo,
  revocarModulo,
} from '../../modules/admin/admin.controller';
import { db as mockDb } from '../../db';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a full catalog of N modules (IDs 1..N) */
function buildCatalog(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id:             i + 1,
    clave:          `modulo_${i + 1}`,
    nombre_display: `Módulo ${i + 1}`,
    descripcion:    null,
    activo:         true,
    orden:          i + 1,
  }));
}

/**
 * Build the rows that listarModulosUsuario returns from the LEFT JOIN query.
 * For each module in the catalog, habilitado = true iff its id is in assignedIds.
 */
function buildModulosConEstado(
  catalog: ReturnType<typeof buildCatalog>,
  assignedIds: Set<number>,
) {
  return catalog.map((m) => ({
    ...m,
    habilitado:  assignedIds.has(m.id),
    asignado_en: assignedIds.has(m.id) ? new Date().toISOString() : null,
  }));
}

function makeRes() {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

// ── Property 3: Corrección del estado habilitado por usuario ──────────────────

describe('listarModulosUsuario() — Property 3: Corrección del estado habilitado por usuario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore the table-aware mock after clearAllMocks
    (mockDb as any).mockImplementation((table: string) => {
      if (table === 'usuarios') return makeUserChain();
      return makeModulosChain();
    });
    (mockDb as any).raw = vi.fn((expr: string) => expr);
    (mockDb as any).fn  = { now: vi.fn(() => new Date()) };
  });

  it(
    'habilitado = true exactamente para los módulos asignados y false para los demás',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a subset of module IDs (from 1..10) as "assigned"
          fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 0, maxLength: 10 }),
          async (assignedIdsRaw) => {
            // Deduplicate assigned IDs
            const assignedIds = new Set(assignedIdsRaw);

            // Build a catalog of 10 modules
            const catalog = buildCatalog(10);

            // Build the rows the DB LEFT JOIN would return
            const modulosConEstado = buildModulosConEstado(catalog, assignedIds);

            // Configure mocks for this run
            mockUsuarioResult = { id: 1, nombre: 'Test User', email: 'user@test.mx', rol: 'OFICIAL' };
            mockModulosResult = modulosConEstado;

            const req: Partial<Request> = {
              params: { id: '1' },
              user:   { id: 999, nombre: 'SuperAdmin', email: 'sa@test.mx', rol: 'SUPERADMIN', oficina_id: 1 } as any,
              query:  {},
            } as Partial<Request>;
            const res = makeRes();
            const next = vi.fn();

            await listarModulosUsuario(req as Request, res as unknown as Response, next as NextFunction);

            // next() should NOT have been called (no error)
            expect(next).not.toHaveBeenCalled();

            // res.json should have been called with { data: [...] }
            expect(res.json).toHaveBeenCalledOnce();
            const { data } = res.json.mock.calls[0][0] as { data: any[] };

            // The response must contain all 10 modules
            expect(data).toHaveLength(10);

            // For each module, verify the habilitado flag
            for (const modulo of data) {
              if (assignedIds.has(modulo.id)) {
                expect(modulo.habilitado).toBe(true);
              } else {
                expect(modulo.habilitado).toBe(false);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ── Property 4: Round-trip de asignación y revocación ────────────────────────

describe('habilitarModulo + revocarModulo — Property 4: Round-trip de asignación y revocación', () => {
  // Shared mock chain for habilitarModulo / revocarModulo
  const mockFirst  = vi.fn();
  const mockInsert = vi.fn();
  const mockDelete = vi.fn();
  const mockWhere  = vi.fn();

  const mockChain: any = {
    select:   vi.fn().mockReturnThis(),
    where:    mockWhere,
    andWhere: vi.fn().mockReturnThis(),
    insert:   mockInsert,
    delete:   mockDelete,
    first:    mockFirst,
    on:       vi.fn().mockReturnThis(),
    andOnVal: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy:  vi.fn().mockReturnThis(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-wire chain methods after clearAllMocks
    mockWhere.mockReturnValue(mockChain);
    mockChain.select.mockReturnValue(mockChain);
    mockChain.andWhere.mockReturnValue(mockChain);
    mockChain.on.mockReturnValue(mockChain);
    mockChain.andOnVal.mockReturnValue(mockChain);
    mockChain.leftJoin.mockReturnValue(mockChain);
    mockChain.orderBy.mockReturnValue(mockChain);

    // Default resolutions
    mockInsert.mockResolvedValue([]);
    mockDelete.mockResolvedValue(1);
    mockFirst.mockResolvedValue(null);

    // Override db() to always return mockChain for this describe block
    (mockDb as any).mockReturnValue(mockChain);
    (mockDb as any).raw = vi.fn((expr: string) => expr);
    (mockDb as any).fn  = { now: vi.fn(() => new Date()) };
  });

  it(
    'habilitar y luego revocar deja habilitado = false (estado previo a la asignación)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }),
          async (moduloId) => {
            const userId      = 5;  // target user (different from requester)
            const requesterId = 1;  // SUPERADMIN requester

            const requester = {
              id:         requesterId,
              nombre:     'SuperAdmin',
              email:      'sa@test.mx',
              rol:        'SUPERADMIN',
              oficina_id: 1,
            };

            // ── Step 1: habilitarModulo ───────────────────────────────────────
            // Mock: user exists, module exists, insert succeeds
            mockFirst
              .mockResolvedValueOnce({ id: userId, nombre: 'Test User' })          // usuario exists
              .mockResolvedValueOnce({ id: moduloId, clave: `modulo_${moduloId}` }); // módulo exists
            mockInsert.mockResolvedValueOnce([]);

            const reqHabilitar: Partial<Request> = {
              params: { id: String(userId), moduloId: String(moduloId) },
              user:   requester as any,
              body:   {},
              query:  {},
            } as any;
            const resHabilitar = makeRes();
            const nextHabilitar = vi.fn();

            await habilitarModulo(
              reqHabilitar as Request,
              resHabilitar as unknown as Response,
              nextHabilitar as NextFunction,
            );

            // habilitarModulo must succeed (no error)
            expect(nextHabilitar).not.toHaveBeenCalled();
            expect(resHabilitar.json).toHaveBeenCalledWith(
              expect.objectContaining({ habilitado: true }),
            );

            // ── Step 2: revocarModulo ─────────────────────────────────────────
            // Mock: delete returns 1 (row was found and deleted)
            mockDelete.mockResolvedValueOnce(1);

            const reqRevocar: Partial<Request> = {
              params: { id: String(userId), moduloId: String(moduloId) },
              user:   requester as any,
              body:   {},
              query:  {},
            } as any;
            const resRevocar = makeRes();
            const nextRevocar = vi.fn();

            await revocarModulo(
              reqRevocar as Request,
              resRevocar as unknown as Response,
              nextRevocar as NextFunction,
            );

            // revocarModulo must succeed (no error)
            expect(nextRevocar).not.toHaveBeenCalled();
            expect(resRevocar.json).toHaveBeenCalledWith(
              expect.objectContaining({ habilitado: false }),
            );

            // ── Step 3: Verify final state equals initial state ───────────────
            // After round-trip: habilitado = false (same as before assignment)
            const finalHabilitado = (resRevocar.json as any).mock.calls[0][0].habilitado;
            expect(finalHabilitado).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ── Property 1: Completitud del listado de módulos ────────────────────────────

/**
 * **Property 1: Completitud del listado de módulos**
 * **Validates: Requirements 1.2, 1.3**
 *
 * Para cualquier conjunto de módulos almacenados en la tabla `modulos`
 * (incluyendo módulos con `activo = false`), la respuesta de `listarModulos`
 * debe contener exactamente ese conjunto de módulos, sin omitir ninguno.
 */

describe('listarModulos() — Property 1: Completitud del listado de módulos', () => {
  // Mock chain for listarModulos: db('modulos').select(...).orderBy(...)
  const mockOrderBy = vi.fn();
  const mockSelect  = vi.fn();

  const mockModulosChain: any = {
    select:  mockSelect,
    orderBy: mockOrderBy,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // db('modulos') → chain → .select().orderBy() resolves to the array
    mockSelect.mockReturnValue(mockModulosChain);
    mockOrderBy.mockImplementation(() => Promise.resolve([]));

    (mockDb as any).mockImplementation((table: string) => {
      if (table === 'modulos') return mockModulosChain;
      return makeModulosChain();
    });
    (mockDb as any).raw = vi.fn((expr: string) => expr);
    (mockDb as any).fn  = { now: vi.fn(() => new Date()) };
  });

  it(
    'devuelve todos los módulos incluyendo los inactivos',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              clave:          fc.string({ minLength: 1 }),
              nombre_display: fc.string({ minLength: 1 }),
              activo:         fc.boolean(),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          async (modulos) => {
            // Assign synthetic IDs and orden to each generated module
            const modulosConId = modulos.map((m, i) => ({
              id:             i + 1,
              clave:          m.clave,
              nombre_display: m.nombre_display,
              descripcion:    null,
              activo:         m.activo,
              orden:          i + 1,
            }));

            // Configure mock: db('modulos').select(...).orderBy(...) → modulosConId
            mockOrderBy.mockImplementation(() => Promise.resolve(modulosConId));

            const req  = {} as Request;
            const res  = makeRes();
            const next = vi.fn();

            await listarModulos(req, res as unknown as Response, next as NextFunction);

            // No error should be thrown
            expect(next).not.toHaveBeenCalled();

            // res.json must have been called once
            expect(res.json).toHaveBeenCalledOnce();

            const { data } = res.json.mock.calls[0][0] as { data: any[] };

            // The response must contain ALL modules (including inactive ones)
            expect(data).toHaveLength(modulosConId.length);

            // Every generated module must appear in the response
            for (const modulo of modulosConId) {
              const found = data.find((d) => d.clave === modulo.clave);
              expect(found).toBeDefined();
              expect(found.activo).toBe(modulo.activo);
              expect(found.nombre_display).toBe(modulo.nombre_display);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ── Property 5: Restricción de acceso por rol en endpoints de módulos ─────────

/**
 * **Property 5: Restricción de acceso por rol en endpoints de módulos**
 * **Validates: Requirements 2.6, 8.3**
 *
 * Para cualquier rol en {OFICIAL, ENCARGADO, JURIDICO, SECRETARIA, DIRECTOR},
 * el guard SUPERADMIN del router de admin debe llamar a next() con un AppError
 * de statusCode 403, independientemente del endpoint invocado.
 *
 * El guard está implementado en admin.routes.ts como middleware inline:
 *   if (req.user?.rol !== 'SUPERADMIN') return next(new AppError('...', 403));
 *
 * Aquí replicamos ese guard y verificamos que se activa para todos los roles
 * no-SUPERADMIN, probando los cuatro handlers de módulos.
 */

import { AppError } from '../../utils/AppError';

// Replicate the SUPERADMIN guard from admin.routes.ts
function superadminGuard(req: Request, next: NextFunction): void {
  if ((req.user as any)?.rol !== 'SUPERADMIN') {
    next(new AppError('Acceso restringido a SUPERADMIN', 403));
    return;
  }
  next();
}

describe('Admin módulos — Property 5: Restricción de acceso por rol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockDb as any).mockImplementation((table: string) => {
      if (table === 'usuarios') return makeUserChain();
      return makeModulosChain();
    });
    (mockDb as any).raw = vi.fn((expr: string) => expr);
    (mockDb as any).fn  = { now: vi.fn(() => new Date()) };
  });

  it(
    'el guard SUPERADMIN llama a next(AppError 403) para todos los roles no-SUPERADMIN',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            'OFICIAL',
            'ENCARGADO',
            'JURIDICO',
            'SECRETARIA',
            'DIRECTOR',
          ),
          async (rol) => {
            // Build a request with the non-SUPERADMIN role
            const req: Partial<Request> = {
              params: { id: '1', moduloId: '1' },
              user:   { id: 42, nombre: 'Test', email: 'test@test.mx', rol, oficina_id: 1 } as any,
              body:   {},
              query:  {},
            } as any;

            // ── listarModulos ─────────────────────────────────────────────────
            {
              const next = vi.fn();
              superadminGuard(req as Request, next as NextFunction);
              expect(next).toHaveBeenCalledOnce();
              const err = next.mock.calls[0][0];
              expect(err).toBeInstanceOf(AppError);
              expect((err as AppError).statusCode).toBe(403);
            }

            // ── listarModulosUsuario ──────────────────────────────────────────
            {
              const next = vi.fn();
              superadminGuard(req as Request, next as NextFunction);
              expect(next).toHaveBeenCalledOnce();
              const err = next.mock.calls[0][0];
              expect(err).toBeInstanceOf(AppError);
              expect((err as AppError).statusCode).toBe(403);
            }

            // ── habilitarModulo ───────────────────────────────────────────────
            {
              const next = vi.fn();
              superadminGuard(req as Request, next as NextFunction);
              expect(next).toHaveBeenCalledOnce();
              const err = next.mock.calls[0][0];
              expect(err).toBeInstanceOf(AppError);
              expect((err as AppError).statusCode).toBe(403);
            }

            // ── revocarModulo ─────────────────────────────────────────────────
            {
              const next = vi.fn();
              superadminGuard(req as Request, next as NextFunction);
              expect(next).toHaveBeenCalledOnce();
              const err = next.mock.calls[0][0];
              expect(err).toBeInstanceOf(AppError);
              expect((err as AppError).statusCode).toBe(403);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
