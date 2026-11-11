/**
 * Pruebas: visibilidad de oficios
 * File: src/tests/unit/oficios.visibilidad.test.ts
 *
 * `puedeVerOficio` es la autorización de los endpoints que entregan documentos.
 * Antes de ella, cualquier sesión válida podía leer todos los oficios del
 * sistema por id. Estas pruebas protegen las propiedades que no deben cambiar
 * sin que alguien se entere.
 *
 * Se afirma el CONTRATO, no el SQL: que para cada rol se aplique (o no) un
 * filtro, y que los casos de negativa nieguen. Afirmar el texto exacto de la
 * consulta es lo que dejó obsoletas tres pruebas de `permission.guard.test.ts`
 * cuando la regla de DIRECTOR cambió a propósito.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock de la base, antes de importar el módulo ──────────────────────────────

/** Unidades que devolverá `getUnidadesEncargado`. Cada prueba lo ajusta. */
let unidadesEncargado: number[] = [];
/** Fila que devolverá la búsqueda en `asignaciones_juridicas`. */
let asignacion: { abogado_id: number } | null = null;
/** Fila final: `null` = el oficio quedó fuera del alcance. */
let filaFinal: { id: number } | null = { id: 7 };
/** Cuántos filtros `where` se aplicaron sobre la consulta de oficios. */
let wheresAplicados = 0;

function consultaOficios(): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  const cadena = (contar: boolean) => vi.fn((..._args: unknown[]) => {
    if (contar) wheresAplicados += 1;
    return q;
  });
  q.leftJoin    = vi.fn(() => q);
  q.where       = cadena(true);
  q.andWhere    = cadena(false);
  q.whereIn     = cadena(false);
  q.whereRaw    = cadena(false);
  q.orWhereRaw  = cadena(false);
  q.select      = vi.fn(() => q);
  q.first       = vi.fn(async () => filaFinal);
  return q;
}

vi.mock('../../db', () => {
  const db = vi.fn((tabla: string) => {
    if (tabla === 'configuracion_flujos') {
      const q: Record<string, unknown> = {};
      q.where       = vi.fn(() => q);
      q.whereNotNull = vi.fn(() => q);
      q.pluck       = vi.fn(async () => unidadesEncargado);
      return q;
    }
    if (tabla === 'asignaciones_juridicas') {
      const q: Record<string, unknown> = {};
      q.where = vi.fn(() => q);
      q.first = vi.fn(async () => asignacion);
      return q;
    }
    return consultaOficios();
  });
  return { db };
});

import { puedeVerOficio } from '../../modules/oficialia_partes/oficios.visibilidad';
import type { AuthUser }  from '../../modules/oficialia_partes/oficios.types';

function usuario(parcial: Partial<AuthUser>): AuthUser {
  return {
    id: 1, nombre: 'Prueba', email: 'p@q', rol: 'OFICIAL',
    oficina_id: 10, unidad_id: 10, unidad_tipo: 'DELEGACION',
    ...parcial,
  };
}

beforeEach(() => {
  unidadesEncargado = [];
  asignacion        = null;
  filaFinal         = { id: 7 };
  wheresAplicados   = 0;
});

describe('puedeVerOficio() — autorización de documentos por oficio', () => {

  describe('validación del id', () => {
    it('niega un id que no es entero, sin consultar la base', async () => {
      expect(await puedeVerOficio(usuario({}), Number.NaN)).toBe(false);
      expect(wheresAplicados).toBe(0);
    });

    it('niega un id fraccionario', async () => {
      expect(await puedeVerOficio(usuario({}), 1.5)).toBe(false);
    });
  });

  describe('roles con alcance restringido — debe aplicarse un filtro', () => {
    it('OFICIAL: filtra por su oficina y por lo que él registró', async () => {
      await puedeVerOficio(usuario({ rol: 'OFICIAL' }), 7);
      expect(wheresAplicados).toBeGreaterThan(1); // el id + el alcance
    });

    it('JURIDICO: filtra por asignación propia o solicitud dirigida a él', async () => {
      await puedeVerOficio(usuario({ rol: 'JURIDICO' }), 7);
      expect(wheresAplicados).toBeGreaterThan(1);
    });

    it('DIRECTOR de área: filtra por lo dirigido a él', async () => {
      await puedeVerOficio(usuario({ rol: 'DIRECTOR', unidad_tipo: 'DELEGACION' }), 7);
      expect(wheresAplicados).toBeGreaterThan(1);
    });

    it('encargado de flujo: filtra por sus unidades, por encima de su rol', async () => {
      unidadesEncargado = [10, 11];
      await puedeVerOficio(usuario({ rol: 'OPERATIVO' }), 7);
      expect(wheresAplicados).toBeGreaterThan(1);
    });
  });

  describe('roles de alcance total — documentado y deliberado', () => {
    it('SECRETARIA ve cualquier oficio: solo filtra por id', async () => {
      await puedeVerOficio(usuario({ rol: 'SECRETARIA' }), 7);
      expect(wheresAplicados).toBe(1);
    });

    it('DIRECTOR de la Dirección General ve cualquier oficio', async () => {
      await puedeVerOficio(usuario({ rol: 'DIRECTOR', unidad_tipo: 'DIRECCION_GENERAL' }), 7);
      expect(wheresAplicados).toBe(1);
    });
  });

  describe('negativa', () => {
    it('un rol sin regla propia y sin asignaciones queda fuera', async () => {
      asignacion = null;
      expect(await puedeVerOficio(usuario({ rol: 'PARTICULAR' }), 7)).toBe(false);
    });

    it('un rol sin regla propia CON asignaciones sí pasa por el filtro', async () => {
      asignacion = { abogado_id: 1 };
      await puedeVerOficio(usuario({ rol: 'PARTICULAR' }), 7);
      expect(wheresAplicados).toBeGreaterThan(1);
    });

    it('si el oficio queda fuera del alcance, devuelve false', async () => {
      filaFinal = null;
      expect(await puedeVerOficio(usuario({ rol: 'OFICIAL' }), 7)).toBe(false);
    });

    it('si el oficio está dentro del alcance, devuelve true', async () => {
      filaFinal = { id: 7 };
      expect(await puedeVerOficio(usuario({ rol: 'OFICIAL' }), 7)).toBe(true);
    });
  });
});
