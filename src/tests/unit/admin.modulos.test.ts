/**
 * Unit Tests: Admin — Endpoints de gestión de módulos
 * File: src/tests/unit/admin.modulos.test.ts
 *
 * Casos cubiertos:
 *  - listarModulosUsuario: devuelve todos los módulos con habilitado=true solo para los asignados
 *  - habilitarModulo: devuelve 409 si el módulo ya está habilitado
 *  - revocarModulo: devuelve 404 si el módulo no está habilitado
 *  - habilitarModulo: devuelve 422 si el requester intenta modificar sus propios módulos
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Mock db antes de importar el controller ───────────────────────────────────

const mockQuery = {
  select:    vi.fn().mockReturnThis(),
  where:     vi.fn().mockReturnThis(),
  andWhere:  vi.fn().mockReturnThis(),
  leftJoin:  vi.fn().mockReturnThis(),
  orderBy:   vi.fn().mockReturnThis(),
  first:     vi.fn().mockResolvedValue(null),
  insert:    vi.fn().mockResolvedValue([]),
  delete:    vi.fn().mockResolvedValue(0),
  on:        vi.fn().mockReturnThis(),
  andOnVal:  vi.fn().mockReturnThis(),
};

vi.mock('../../db', () => {
  const mockDbFn: any = vi.fn(() => mockQuery);
  mockDbFn.raw = vi.fn().mockReturnValue('raw_fragment');
  mockDbFn.fn  = { now: vi.fn().mockReturnValue('NOW()') };
  return { db: mockDbFn };
});

vi.mock('../../utils/AppError', () => ({
  AppError: class AppError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

// bcrypt es un módulo nativo — mockearlo para evitar errores de carga en el entorno de test
vi.mock('bcrypt', () => ({
  default: {
    hash:    vi.fn().mockResolvedValue('hashed_password'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { db as mockDb } from '../../db';
import {
  listarModulosUsuario,
  habilitarModulo,
  revocarModulo,
} from '../../modules/admin/admin.controller';

// ── Helpers ───────────────────────────────────────────────────────────────────

type AuthUser = {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  oficina_id: number;
};

function makeReq(
  params: Record<string, string> = {},
  user: AuthUser = { id: 1, nombre: 'Admin', email: 'admin@test.mx', rol: 'SUPERADMIN', oficina_id: 1 },
  body: Record<string, any> = {},
): Partial<Request> {
  return { params, user: user as any, body } as Partial<Request>;
}

function makeRes(): { json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const next: NextFunction = vi.fn();

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Re-wire chain after clear
  mockQuery.select.mockReturnValue(mockQuery);
  mockQuery.where.mockReturnValue(mockQuery);
  mockQuery.andWhere.mockReturnValue(mockQuery);
  mockQuery.leftJoin.mockReturnValue(mockQuery);
  mockQuery.orderBy.mockReturnValue(mockQuery);
  mockQuery.first.mockResolvedValue(null);
  mockQuery.insert.mockResolvedValue([]);
  mockQuery.delete.mockResolvedValue(0);
  mockQuery.on.mockReturnValue(mockQuery);
  mockQuery.andOnVal.mockReturnValue(mockQuery);

  (mockDb as any).raw = vi.fn().mockReturnValue('raw_fragment');
  (mockDb as any).fn  = { now: vi.fn().mockReturnValue('NOW()') };
  (mockDb as any).mockReturnValue(mockQuery);
});

// ── listarModulosUsuario ──────────────────────────────────────────────────────

describe('listarModulosUsuario()', () => {
  it('devuelve 404 si el usuario no existe', async () => {
    // El primer .first() (buscar usuario) devuelve null
    mockQuery.first.mockResolvedValueOnce(null);

    const req = makeReq({ id: '99' });
    const res = makeRes();

    await listarModulosUsuario(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('devuelve todos los módulos con habilitado=true solo para los asignados', async () => {
    // El primer .first() (buscar usuario) devuelve un usuario válido
    mockQuery.first.mockResolvedValueOnce({ id: 5, nombre: 'Juan', email: 'juan@test.mx', rol: 'OFICIAL' });

    // El segundo query (LEFT JOIN módulos + usuario_modulos) devuelve el array de módulos
    const modulosMock = [
      { id: 1, clave: 'oficialia_partes',    nombre_display: 'Oficialía de Partes',    activo: true, orden: 1, habilitado: true,  asignado_en: '2024-01-01' },
      { id: 2, clave: 'supervision_eventos', nombre_display: 'Supervisión de Eventos', activo: true, orden: 2, habilitado: false, asignado_en: null },
    ];

    // El segundo llamado a mockDb() devuelve un query que resuelve el array
    const mockQueryModulos = {
      ...mockQuery,
      orderBy: vi.fn().mockResolvedValue(modulosMock),
    };

    // Primera llamada → buscar usuario; segunda llamada → LEFT JOIN módulos
    (mockDb as any)
      .mockReturnValueOnce(mockQuery)       // db('usuarios')
      .mockReturnValueOnce(mockQueryModulos); // db('modulos as m')

    // Re-wire el primer query para que .select().where().first() funcione
    mockQuery.select.mockReturnValue(mockQuery);
    mockQuery.where.mockReturnValue(mockQuery);
    mockQuery.first.mockResolvedValueOnce({ id: 5, nombre: 'Juan', email: 'juan@test.mx', rol: 'OFICIAL' });

    // Re-wire el segundo query
    mockQueryModulos.leftJoin = vi.fn().mockReturnValue(mockQueryModulos);
    mockQueryModulos.select   = vi.fn().mockReturnValue(mockQueryModulos);
    mockQueryModulos.orderBy  = vi.fn().mockResolvedValue(modulosMock);

    const req = makeReq({ id: '5' });
    const res = makeRes();

    await listarModulosUsuario(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ data: modulosMock });

    // Verificar que habilitado=true solo para el módulo asignado
    const data = (res.json as any).mock.calls[0][0].data as typeof modulosMock;
    const habilitados = data.filter((m) => m.habilitado === true);
    const noHabilitados = data.filter((m) => m.habilitado === false);

    expect(habilitados).toHaveLength(1);
    expect(habilitados[0].clave).toBe('oficialia_partes');
    expect(noHabilitados).toHaveLength(1);
    expect(noHabilitados[0].clave).toBe('supervision_eventos');
  });
});

// ── habilitarModulo ───────────────────────────────────────────────────────────

describe('habilitarModulo()', () => {
  it('devuelve 422 si el requester intenta modificar sus propios módulos', async () => {
    const requester: AuthUser = { id: 10, nombre: 'Admin', email: 'admin@test.mx', rol: 'SUPERADMIN', oficina_id: 1 };
    const req = makeReq({ id: '10', moduloId: '1' }, requester);
    const res = makeRes();

    await habilitarModulo(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 422 }),
    );
    // No debe haber llegado a consultar la BD
    expect(mockQuery.first).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el usuario objetivo no existe', async () => {
    // Primer .first() → usuario no encontrado
    mockQuery.first.mockResolvedValueOnce(null);

    const requester: AuthUser = { id: 1, nombre: 'Admin', email: 'admin@test.mx', rol: 'SUPERADMIN', oficina_id: 1 };
    const req = makeReq({ id: '99', moduloId: '1' }, requester);
    const res = makeRes();

    await habilitarModulo(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('devuelve 404 si el módulo no existe', async () => {
    // Primer .first() → usuario encontrado
    mockQuery.first
      .mockResolvedValueOnce({ id: 5, nombre: 'Juan' })  // usuario existe
      .mockResolvedValueOnce(null);                        // módulo no existe

    const requester: AuthUser = { id: 1, nombre: 'Admin', email: 'admin@test.mx', rol: 'SUPERADMIN', oficina_id: 1 };
    const req = makeReq({ id: '5', moduloId: '999' }, requester);
    const res = makeRes();

    await habilitarModulo(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('devuelve 409 si el módulo ya está habilitado (violación de PK única)', async () => {
    // Usuario y módulo existen
    mockQuery.first
      .mockResolvedValueOnce({ id: 5, nombre: 'Juan' })
      .mockResolvedValueOnce({ id: 1, clave: 'oficialia_partes' });

    // INSERT lanza error de violación de unicidad (código 23505)
    const pkError = Object.assign(new Error('duplicate key value'), { code: '23505' });
    mockQuery.insert.mockRejectedValueOnce(pkError);

    const requester: AuthUser = { id: 1, nombre: 'Admin', email: 'admin@test.mx', rol: 'SUPERADMIN', oficina_id: 1 };
    const req = makeReq({ id: '5', moduloId: '1' }, requester);
    const res = makeRes();

    await habilitarModulo(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409 }),
    );
  });

  it('habilita el módulo correctamente y devuelve habilitado: true', async () => {
    // Usuario y módulo existen
    mockQuery.first
      .mockResolvedValueOnce({ id: 5, nombre: 'Juan' })
      .mockResolvedValueOnce({ id: 1, clave: 'oficialia_partes' });

    // INSERT exitoso
    mockQuery.insert.mockResolvedValueOnce([]);

    const requester: AuthUser = { id: 1, nombre: 'Admin', email: 'admin@test.mx', rol: 'SUPERADMIN', oficina_id: 1 };
    const req = makeReq({ id: '5', moduloId: '1' }, requester);
    const res = makeRes();

    await habilitarModulo(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ habilitado: true }),
    );
  });
});

// ── revocarModulo ─────────────────────────────────────────────────────────────

describe('revocarModulo()', () => {
  it('devuelve 422 si el requester intenta modificar sus propios módulos', async () => {
    const requester: AuthUser = { id: 10, nombre: 'Admin', email: 'admin@test.mx', rol: 'SUPERADMIN', oficina_id: 1 };
    const req = makeReq({ id: '10', moduloId: '1' }, requester);
    const res = makeRes();

    await revocarModulo(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 422 }),
    );
  });

  it('devuelve 404 si el módulo no está habilitado para el usuario (rowCount = 0)', async () => {
    // DELETE devuelve 0 filas afectadas
    mockQuery.delete.mockResolvedValueOnce(0);

    const requester: AuthUser = { id: 1, nombre: 'Admin', email: 'admin@test.mx', rol: 'SUPERADMIN', oficina_id: 1 };
    const req = makeReq({ id: '5', moduloId: '2' }, requester);
    const res = makeRes();

    await revocarModulo(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it('revoca el módulo correctamente y devuelve habilitado: false', async () => {
    // DELETE devuelve 1 fila afectada
    mockQuery.delete.mockResolvedValueOnce(1);

    const requester: AuthUser = { id: 1, nombre: 'Admin', email: 'admin@test.mx', rol: 'SUPERADMIN', oficina_id: 1 };
    const req = makeReq({ id: '5', moduloId: '1' }, requester);
    const res = makeRes();

    await revocarModulo(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ habilitado: false }),
    );
  });
});
