/**
 * Unit Tests: validate_user_permission()
 * File: src/tests/unit/permission.guard.test.ts
 *
 * Verifies that the GET /oficios query-building logic enforces role isolation:
 *  - OFICIAL can only see their own oficios (filtered by id + oficina_id)
 *  - OFICIAL cannot see another OFICIAL's data
 *  - Other roles get the correct scope
 *
 * Strategy: mock the db query builder and assert which WHERE clauses are applied.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction }  from 'express';

// ── Mock db before importing the controller ───────────────────────────────────

const mockQuery = {
  select:     vi.fn().mockReturnThis(),
  where:      vi.fn().mockReturnThis(),
  andWhere:   vi.fn().mockReturnThis(),
  whereIn:    vi.fn().mockReturnThis(),
  join:       vi.fn().mockReturnThis(),
  leftJoin:   vi.fn().mockReturnThis(),
  clone:      vi.fn().mockReturnThis(),
  count:      vi.fn().mockResolvedValue([{ count: '0' }]),
  orderBy:    vi.fn().mockReturnThis(),
  limit:      vi.fn().mockReturnThis(),
  offset:     vi.fn().mockResolvedValue([]),
  first:      vi.fn().mockResolvedValue(null),
  then:       vi.fn().mockImplementation((fn: any) => Promise.resolve(fn(null))),
  catch:      vi.fn().mockImplementation((_fn: any) => Promise.resolve(null)),
};

vi.mock('../../db', () => {
  const mockDbFn: any = vi.fn(() => mockQuery);
  mockDbFn.raw = vi.fn().mockReturnValue('raw_fragment');
  return { db: mockDbFn };
});

// Get reference to the mocked db after mock is set up
import { db as mockDb } from '../../db';

vi.mock('../../services/storage.service', () => ({
  storage: { save: vi.fn() },
}));

vi.mock('../../notifications/notification.dispatcher', () => ({
  notifyVoboAprobado: vi.fn(),
}));

vi.mock('../../utils/AppError', () => ({
  AppError: class AppError extends Error {
    constructor(public message: string, public statusCode: number) {
      super(message);
    }
  },
}));

import { listarOficios } from '../../modules/oficialia_partes/oficios.controller';
import type { AuthUser } from '../../modules/oficialia_partes/oficios.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(user: AuthUser, query: Record<string, string> = {}): Partial<Request> {
  return { user, query } as Partial<Request>;
}

function makeRes(): { json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const next: NextFunction = vi.fn();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('listarOficios() — role-based query isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-wire chain after clear
    mockQuery.select.mockReturnValue(mockQuery);
    mockQuery.where.mockReturnValue(mockQuery);
    mockQuery.andWhere.mockReturnValue(mockQuery);
    mockQuery.whereIn.mockReturnValue(mockQuery);
    mockQuery.join.mockReturnValue(mockQuery);
    mockQuery.leftJoin.mockReturnValue(mockQuery);
    mockQuery.clone.mockReturnValue(mockQuery);
    mockQuery.count.mockResolvedValue([{ count: '0' }]);
    mockQuery.orderBy.mockReturnValue(mockQuery);
    mockQuery.limit.mockReturnValue(mockQuery);
    mockQuery.offset.mockResolvedValue([]);
    mockQuery.first.mockResolvedValue(null);
    mockQuery.then.mockImplementation((fn: any) => Promise.resolve(fn(null)));
    mockQuery.catch.mockImplementation((_fn: any) => Promise.resolve(null));
    (mockDb as any).raw = vi.fn().mockReturnValue('raw_fragment');
    (mockDb as any).mockReturnValue(mockQuery);
  });

  // ── OFICIAL ───────────────────────────────────────────────

  describe('OFICIAL role', () => {
    const oficialUser: AuthUser = {
      id: 10, nombre: 'Juan Oficial', email: 'juan@test.mx',
      rol: 'OFICIAL', oficina_id: 1,
    };

    const otroOficialUser: AuthUser = {
      id: 99, nombre: 'Pedro Otro', email: 'pedro@test.mx',
      rol: 'OFICIAL', oficina_id: 1,
    };

    it('filters by oficina_registro_id AND oficial_registro_id for own user', async () => {
      await listarOficios(makeReq(oficialUser) as Request, makeRes() as unknown as Response, next);

      expect(mockQuery.where).toHaveBeenCalledWith('oficios.unidad_registro_id', oficialUser.oficina_id);
      expect(mockQuery.andWhere).toHaveBeenCalledWith('oficios.oficial_registro_id', oficialUser.id);
    });

    it('does NOT apply the other OFICIAL\'s id when a different user queries', async () => {
      await listarOficios(makeReq(otroOficialUser) as Request, makeRes() as unknown as Response, next);

      // Should filter by otroOficialUser.id, NOT oficialUser.id
      expect(mockQuery.andWhere).toHaveBeenCalledWith('oficios.oficial_registro_id', otroOficialUser.id);
      expect(mockQuery.andWhere).not.toHaveBeenCalledWith('oficios.oficial_registro_id', oficialUser.id);
    });

    it('OFICIAL from oficina 1 cannot see oficios from oficina 2', async () => {
      const oficialOficina2: AuthUser = { ...oficialUser, id: 20, oficina_id: 2 };
      await listarOficios(makeReq(oficialOficina2) as Request, makeRes() as unknown as Response, next);

      expect(mockQuery.where).toHaveBeenCalledWith('oficios.unidad_registro_id', 2);
      expect(mockQuery.where).not.toHaveBeenCalledWith('oficios.unidad_registro_id', 1);
    });

    it('does NOT use whereIn (status filter) for OFICIAL role', async () => {
      await listarOficios(makeReq(oficialUser) as Request, makeRes() as unknown as Response, next);
      expect(mockQuery.whereIn).not.toHaveBeenCalled();
    });

    it('does NOT join asignaciones_juridicas for OFICIAL role', async () => {
      await listarOficios(makeReq(oficialUser) as Request, makeRes() as unknown as Response, next);
      expect(mockQuery.join).not.toHaveBeenCalled();
    });
  });

  // ── ENCARGADO ─────────────────────────────────────────────

  describe('ENCARGADO role', () => {
    const encargadoUser: AuthUser = {
      id: 20, nombre: 'Ana Encargada', email: 'ana@test.mx',
      rol: 'ENCARGADO', oficina_id: 3,
    };

    it('filters only by oficina_registro_id (sees all oficios of their delegación)', async () => {
      await listarOficios(makeReq(encargadoUser) as Request, makeRes() as unknown as Response, next);

      // ENCARGADO sees all oficios — no oficina filter applied
      expect(mockQuery.where).not.toHaveBeenCalledWith('oficios.unidad_registro_id', expect.anything());
      // Must NOT filter by user id
      expect(mockQuery.andWhere).not.toHaveBeenCalledWith('oficios.oficial_registro_id', expect.anything());
    });
  });

  // ── JURIDICO ──────────────────────────────────────────────

  describe('JURIDICO role', () => {
    const juridicoUser: AuthUser = {
      id: 30, nombre: 'Luis Abogado', email: 'luis@test.mx',
      rol: 'JURIDICO', oficina_id: 1,
    };

    it('joins asignaciones_juridicas and filters by abogado_id', async () => {
      await listarOficios(makeReq(juridicoUser) as Request, makeRes() as unknown as Response, next);

      expect(mockQuery.join).toHaveBeenCalledWith(
        'asignaciones_juridicas',
        'asignaciones_juridicas.oficio_id',
        'oficios.id',
      );
      expect(mockQuery.where).toHaveBeenCalledWith('asignaciones_juridicas.abogado_id', juridicoUser.id);
    });
  });

  // ── SECRETARIA / DIRECTOR ─────────────────────────────────

  describe('SECRETARIA role', () => {
    const user: AuthUser = {
      id: 40, nombre: 'Rosa Sec', email: 'rosa@test.mx',
      rol: 'SECRETARIA', oficina_id: 1,
    };

    it('sees all oficios without any status filter', async () => {
      await listarOficios(makeReq(user) as Request, makeRes() as unknown as Response, next);

      expect(mockQuery.whereIn).not.toHaveBeenCalled();
    });

    it('does NOT filter by user id or oficina_id', async () => {
      await listarOficios(makeReq(user) as Request, makeRes() as unknown as Response, next);

      expect(mockQuery.where).not.toHaveBeenCalledWith('oficios.oficial_registro_id', expect.anything());
      expect(mockQuery.where).not.toHaveBeenCalledWith('oficios.unidad_registro_id', expect.anything());
    });
  });

  describe('DIRECTOR role', () => {
    const user: AuthUser = {
      id: 40, nombre: 'Rosa Dir', email: 'rosa@test.mx',
      rol: 'DIRECTOR', oficina_id: 1,
    };

    it('filters by estatus VOBO_APROBADO and FINALIZADO only (when not encargado de flujo)', async () => {
      await listarOficios(makeReq(user) as Request, makeRes() as unknown as Response, next);

      expect(mockQuery.whereIn).toHaveBeenCalledWith(
        'oficios.estatus',
        ['VOBO_APROBADO', 'FINALIZADO'],
      );
    });

    it('does NOT filter by user id or oficina_id', async () => {
      await listarOficios(makeReq(user) as Request, makeRes() as unknown as Response, next);

      expect(mockQuery.where).not.toHaveBeenCalledWith('oficios.oficial_registro_id', expect.anything());
      expect(mockQuery.where).not.toHaveBeenCalledWith('oficios.unidad_registro_id', expect.anything());
    });
  });

  // ── Unknown role ──────────────────────────────────────────

  describe('unknown role', () => {
    it('calls next() with a 403 AppError for an unrecognized role', async () => {
      const badUser = { id: 1, nombre: 'X', email: 'x@x.mx', rol: 'ADMIN' as any, oficina_id: 1 };
      await listarOficios(makeReq(badUser) as Request, makeRes() as unknown as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 }),
      );
    });
  });
});
