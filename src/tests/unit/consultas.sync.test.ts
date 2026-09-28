/**
 * Unit Tests: revisarPagina() — sincronización con la API de Consulta Pública (SID)
 * File: src/tests/unit/consultas.sync.test.ts
 *
 * Cubre las dos reglas sutiles del proceso, las mismas que fallaron al
 * escribirlo y que no se notan a simple vista en producción:
 *
 *  1. La marca de agua corta lo ya traído, pero NO a media página: la API
 *     ordena por hora y los ids de búsquedas del mismo segundo salen
 *     cruzados (data real: 89892, 89890, 89891). Cortar en el primer id
 *     conocido dejaría fuera al rezagado del cruce.
 *  2. Las filas inservibles se descartan una por una, sin tumbar la corrida.
 *
 * Runner: Vitest
 */

import { describe, it, expect } from 'vitest';
import { revisarPagina } from '../../integraciones/consultas.sync';

/** Fila válida de la API, con los campos que exige `consulta_publica`. */
function fila(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    nombre_completo: `USUARIO ${id}`,
    nombres:         null,
    apellido:        null,
    codigo_acceso:   '000',
    busqueda:        { folio: String(id) },
    filtro_busqueda: 'Búsqueda por folio',
    tipo_usuario:    'Consulta Pública',
    oficina:         '2',
    folio:           String(id),
    estado_contador: 'activo',
    hora_busqueda:   '2026-09-28T15:02:09.000000Z',
    ...extra,
  } as Parameters<typeof revisarPagina>[0][number];
}

describe('revisarPagina', () => {
  it('deja pasar solo lo que está por encima de la marca de agua', () => {
    const r = revisarPagina([fila(105), fila(104), fila(103)], 103, 0);

    expect(r.pendientes.map((f) => f.id)).toEqual([105, 104]);
    expect(r.bajoLaMarca).toBe(true);
    expect(r.idMasAlto).toBe(105);
  });

  it('no se detiene al primer id conocido: rescata los ids cruzados del mismo segundo', () => {
    // 100 está bajo la marca y aparece ANTES que 101 por el orden por hora.
    // Si el recorrido cortara ahí, 101 se perdería para siempre.
    const r = revisarPagina([fila(102), fila(100), fila(101)], 100, 0);

    expect(r.pendientes.map((f) => f.id)).toEqual([102, 101]);
    expect(r.idMasAlto).toBe(102);
  });

  it('conserva el id más alto visto en páginas anteriores', () => {
    const r = revisarPagina([fila(50), fila(49)], 10, 90_000);
    expect(r.idMasAlto).toBe(90_000);
  });

  it('descarta las filas sin lo mínimo indispensable, sin perder las buenas', () => {
    const r = revisarPagina(
      [
        fila(10),
        fila(9,  { codigo_acceso: '   ' }),
        fila(8,  { busqueda: null }),
        fila(7,  { hora_busqueda: null }),
        fila(6),
      ],
      0,
      0,
    );

    expect(r.pendientes.map((f) => f.id)).toEqual([10, 6]);
    expect(r.descartadas.map((d) => d.id)).toEqual([9, 8, 7]);
    expect(r.descartadas[0].motivo).toContain('codigo_acceso');
  });

  it('marca bajoLaMarca solo cuando algo quedó por debajo', () => {
    expect(revisarPagina([fila(20), fila(19)], 5, 0).bajoLaMarca).toBe(false);
    expect(revisarPagina([fila(20), fila(4)],  5, 0).bajoLaMarca).toBe(true);
  });

  it('una página vacía no rompe ni mueve el id más alto', () => {
    const r = revisarPagina([], 100, 500);
    expect(r.pendientes).toHaveLength(0);
    expect(r.descartadas).toHaveLength(0);
    expect(r.idMasAlto).toBe(500);
    expect(r.bajoLaMarca).toBe(false);
  });
});
