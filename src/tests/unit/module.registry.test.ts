/**
 * Unit Tests: ModuleRegistry
 * File: src/tests/unit/module.registry.test.ts
 *
 * Verifica el comportamiento del singleton ModuleRegistry:
 *  - register() + computeAll() con función mock que devuelve métricas fijas
 *  - computeAll() cuando la función registrada lanza un error
 *  - computeAll() cuando el módulo no tiene función registrada (devuelve ceros)
 *
 * Estrategia: mockear db para controlar los módulos activos devueltos por la BD,
 * y usar funciones mock para las métricas de cada módulo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock db antes de importar el módulo ───────────────────────────────────────

const mockModulos: { clave: string; nombre: string; orden: number }[] = [];

const mockQuery = {
  where:   vi.fn().mockReturnThis(),
  select:  vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockImplementation(() => Promise.resolve(mockModulos)),
};

vi.mock('../../db', () => {
  const mockDbFn: any = vi.fn(() => mockQuery);
  return { db: mockDbFn };
});

// Importar el registry DESPUÉS de configurar el mock
import { moduleRegistry } from '../../modules/module-registry/module.registry';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Limpia el registro interno del singleton entre tests */
function clearRegistry(): void {
  // Accedemos al Map privado a través de la instancia singleton
  const reg = moduleRegistry as any;
  reg.registry.clear();
}

/** Configura los módulos que devolverá el mock de db */
function setMockModulos(modulos: { clave: string; nombre: string; orden: number }[]): void {
  mockModulos.length = 0;
  modulos.forEach((m) => mockModulos.push(m));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ModuleRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRegistry();

    // Re-cablear la cadena del mock después de clearAllMocks
    mockQuery.where.mockReturnValue(mockQuery);
    mockQuery.select.mockReturnValue(mockQuery);
    mockQuery.orderBy.mockImplementation(() => Promise.resolve(mockModulos));
  });

  // ── Caso 1: register + computeAll con métricas fijas ─────────────────────

  describe('register() + computeAll() con función mock que devuelve métricas fijas', () => {
    it('devuelve el módulo con los valores correctos de activos, pendientes y alertas', async () => {
      setMockModulos([
        { clave: 'test_modulo', nombre: 'Módulo de Prueba', orden: 1 },
      ]);

      moduleRegistry.register('test_modulo', async () => ({
        activos:    10,
        pendientes: 3,
        alertas:    1,
      }));

      const resultado = await moduleRegistry.computeAll();

      expect(resultado).toHaveLength(1);
      expect(resultado[0]).toMatchObject({
        clave:      'test_modulo',
        nombre:     'Módulo de Prueba',
        orden:      1,
        activos:    10,
        pendientes: 3,
        alertas:    1,
      });
      expect(resultado[0].error).toBeUndefined();
    });

    it('devuelve múltiples módulos con sus métricas correctas', async () => {
      setMockModulos([
        { clave: 'modulo_a', nombre: 'Módulo A', orden: 1 },
        { clave: 'modulo_b', nombre: 'Módulo B', orden: 2 },
      ]);

      moduleRegistry.register('modulo_a', async () => ({
        activos: 5, pendientes: 2, alertas: 0,
      }));
      moduleRegistry.register('modulo_b', async () => ({
        activos: 8, pendientes: 0, alertas: 3,
      }));

      const resultado = await moduleRegistry.computeAll();

      expect(resultado).toHaveLength(2);
      expect(resultado[0]).toMatchObject({ clave: 'modulo_a', activos: 5, pendientes: 2, alertas: 0 });
      expect(resultado[1]).toMatchObject({ clave: 'modulo_b', activos: 8, pendientes: 0, alertas: 3 });
    });
  });

  // ── Caso 2: computeAll cuando la función registrada lanza error ───────────

  describe('computeAll() cuando la función registrada lanza un error', () => {
    it('devuelve activos: null, pendientes: null, alertas: null y campo error con el mensaje', async () => {
      setMockModulos([
        { clave: 'modulo_error', nombre: 'Módulo con Error', orden: 1 },
      ]);

      moduleRegistry.register('modulo_error', async () => {
        throw new Error('Fallo de conexión a la BD');
      });

      const resultado = await moduleRegistry.computeAll();

      expect(resultado).toHaveLength(1);
      expect(resultado[0]).toMatchObject({
        clave:      'modulo_error',
        nombre:     'Módulo con Error',
        orden:      1,
        activos:    null,
        pendientes: null,
        alertas:    null,
        error:      'Fallo de conexión a la BD',
      });
    });

    it('no interrumpe el cálculo de los demás módulos cuando uno falla', async () => {
      setMockModulos([
        { clave: 'modulo_ok',    nombre: 'Módulo OK',    orden: 1 },
        { clave: 'modulo_falla', nombre: 'Módulo Falla', orden: 2 },
      ]);

      moduleRegistry.register('modulo_ok', async () => ({
        activos: 7, pendientes: 1, alertas: 0,
      }));
      moduleRegistry.register('modulo_falla', async () => {
        throw new Error('Error inesperado');
      });

      const resultado = await moduleRegistry.computeAll();

      expect(resultado).toHaveLength(2);
      expect(resultado[0]).toMatchObject({ clave: 'modulo_ok', activos: 7, pendientes: 1, alertas: 0 });
      expect(resultado[0].error).toBeUndefined();
      expect(resultado[1]).toMatchObject({
        clave:      'modulo_falla',
        activos:    null,
        pendientes: null,
        alertas:    null,
        error:      'Error inesperado',
      });
    });
  });

  // ── Caso 3: computeAll cuando el módulo no tiene función registrada ────────

  describe('computeAll() cuando el módulo no tiene función registrada', () => {
    it('devuelve activos: 0, pendientes: 0, alertas: 0 sin campo error', async () => {
      setMockModulos([
        { clave: 'modulo_sin_fn', nombre: 'Módulo Sin Función', orden: 1 },
      ]);

      // No se registra ninguna función para 'modulo_sin_fn'

      const resultado = await moduleRegistry.computeAll();

      expect(resultado).toHaveLength(1);
      expect(resultado[0]).toMatchObject({
        clave:      'modulo_sin_fn',
        nombre:     'Módulo Sin Función',
        orden:      1,
        activos:    0,
        pendientes: 0,
        alertas:    0,
      });
      expect(resultado[0].error).toBeUndefined();
    });

    it('devuelve ceros para módulos sin función y métricas correctas para los que sí tienen', async () => {
      setMockModulos([
        { clave: 'con_fn',    nombre: 'Con Función',    orden: 1 },
        { clave: 'sin_fn',    nombre: 'Sin Función',    orden: 2 },
      ]);

      moduleRegistry.register('con_fn', async () => ({
        activos: 4, pendientes: 2, alertas: 1,
      }));
      // 'sin_fn' no se registra

      const resultado = await moduleRegistry.computeAll();

      expect(resultado).toHaveLength(2);
      expect(resultado[0]).toMatchObject({ clave: 'con_fn', activos: 4, pendientes: 2, alertas: 1 });
      expect(resultado[1]).toMatchObject({ clave: 'sin_fn', activos: 0, pendientes: 0, alertas: 0 });
      expect(resultado[1].error).toBeUndefined();
    });
  });

  // ── Caso adicional: lista vacía cuando no hay módulos activos ─────────────

  describe('computeAll() cuando no hay módulos activos en la BD', () => {
    it('devuelve un array vacío', async () => {
      setMockModulos([]);

      const resultado = await moduleRegistry.computeAll();

      expect(resultado).toEqual([]);
    });
  });
});
