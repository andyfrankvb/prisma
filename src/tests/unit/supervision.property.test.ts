/**
 * Property-Based Tests: Panel de Supervisión del Director
 * File: src/tests/unit/supervision.property.test.ts
 *
 * **Property 6: Completitud del panel de supervisión**
 * **Validates: Requirements 4.3, 5.1**
 *
 * Para cualquier conjunto de módulos con `activo = true` registrados en el
 * ModuleRegistry, computeAll() debe devolver exactamente un ResumenModulo
 * por cada módulo activo, sin omitir ninguno.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ── Mock db before importing the registry ─────────────────────────────────────
//
// The ModuleRegistry calls:
//   db('modulos').where({ activo: true }).select(...).orderBy('orden', 'asc')
//
// We intercept this chain and return the generated modules array.

let mockModulosActivos: { clave: string; nombre: string; orden: number }[] = [];

const mockQuery = {
  where:   vi.fn().mockReturnThis(),
  select:  vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockImplementation(() => Promise.resolve(mockModulosActivos)),
};

vi.mock('../../db', () => {
  const mockDbFn: any = vi.fn(() => mockQuery);
  return { db: mockDbFn };
});

// Import the registry AFTER the mock is configured
import { moduleRegistry } from '../../modules/module-registry/module.registry';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clears the internal registry Map between test runs */
function clearRegistry(): void {
  const reg = moduleRegistry as any;
  reg.registry.clear();
}

/** Replaces the array of active modules returned by the db mock */
function setMockModulos(
  modulos: { clave: string; nombre: string; orden: number }[],
): void {
  mockModulosActivos.splice(0, mockModulosActivos.length, ...modulos);
}

// ── Property Tests ────────────────────────────────────────────────────────────

describe('computeAll() — Property 6: Completitud del panel de supervisión', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRegistry();

    // Restore the mock query chain after vi.clearAllMocks()
    mockQuery.where.mockReturnValue(mockQuery);
    mockQuery.select.mockReturnValue(mockQuery);
    mockQuery.orderBy.mockImplementation(() => Promise.resolve(mockModulosActivos));
  });

  it(
    'devuelve exactamente un ResumenModulo por cada módulo con activo = true',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate an array of 1–8 module records with clave, nombre, activo
          fc.array(
            fc.record({
              clave:  fc.string(),
              nombre: fc.string(),
              activo: fc.boolean(),
            }),
            { minLength: 1, maxLength: 8 },
          ),
          async (generatedModulos) => {
            // Determine which modules are active
            const activeModulos = generatedModulos.filter((m) => m.activo);

            // Build the rows the db mock will return (only active ones, with orden)
            const dbRows = activeModulos.map((m, idx) => ({
              clave:  m.clave,
              nombre: m.nombre,
              orden:  idx + 1,
            }));

            // Configure the db mock for this run
            setMockModulos(dbRows);

            // Register a simple mock metrics function for each active module
            // (simulates modules that have registered their metrics fn)
            for (const row of dbRows) {
              moduleRegistry.register(row.clave, async () => ({
                activos:    1,
                pendientes: 0,
                alertas:    0,
              }));
            }

            // Call computeAll()
            const result = await moduleRegistry.computeAll();

            // Property: result must contain exactly one ResumenModulo per active module
            expect(result).toHaveLength(activeModulos.length);

            // Every active module's clave must appear exactly once in the result
            const resultClaves = result.map((r) => r.clave);
            for (const row of dbRows) {
              expect(resultClaves).toContain(row.clave);
            }

            // No duplicates
            const uniqueClaves = new Set(resultClaves);
            expect(uniqueClaves.size).toBe(result.length);

            // Clean up registry for next run
            clearRegistry();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'devuelve array vacío cuando ningún módulo tiene activo = true',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate modules all with activo = false
          fc.array(
            fc.record({
              clave:  fc.string(),
              nombre: fc.string(),
            }),
            { minLength: 1, maxLength: 8 },
          ),
          async (inactiveModulos) => {
            // db returns empty array (no active modules)
            setMockModulos([]);

            const result = await moduleRegistry.computeAll();

            expect(result).toHaveLength(0);
            expect(result).toEqual([]);

            clearRegistry();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'incluye módulos activos sin función registrada con ceros (no los omite)',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              clave:  fc.string(),
              nombre: fc.string(),
              activo: fc.boolean(),
            }),
            { minLength: 1, maxLength: 8 },
          ),
          async (generatedModulos) => {
            const activeModulos = generatedModulos.filter((m) => m.activo);

            const dbRows = activeModulos.map((m, idx) => ({
              clave:  m.clave,
              nombre: m.nombre,
              orden:  idx + 1,
            }));

            setMockModulos(dbRows);

            // Do NOT register any metrics functions — all modules lack a registered fn

            const result = await moduleRegistry.computeAll();

            // Property: still one ResumenModulo per active module
            expect(result).toHaveLength(activeModulos.length);

            // Each entry must have zeros (not null) since no fn is registered
            for (const entry of result) {
              expect(entry.activos).toBe(0);
              expect(entry.pendientes).toBe(0);
              expect(entry.alertas).toBe(0);
              expect(entry.error).toBeUndefined();
            }

            clearRegistry();
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
