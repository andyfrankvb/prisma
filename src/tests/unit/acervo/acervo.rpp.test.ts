/**
 * Pruebas: validación y consulta de folios RPP (backend)
 * File: src/tests/unit/acervo/acervo.rpp.test.ts
 *
 * Este archivo tenía además cuatro pruebas del formulario y de la presentación,
 * que importaban `frontend/src/modules/acervo/campos`. Eran el último punto
 * donde el backend alcanzaba código del frontend, y no estaban aquí por
 * compartir nada: el frontend no tenía dónde correr sus pruebas.
 *
 * Ahora viven en `frontend/src/modules/acervo/campos.test.ts`, junto a su
 * código. Aquí se queda lo que de verdad es del backend: qué acepta el
 * validador y qué rechaza el constructor de la consulta.
 */

import { describe, expect, it } from 'vitest';
import { leerInmueble } from '../../../modules/acervo/acervo.search.validation';
import { AcervoFoliosRpp } from '../../../modules/acervo/acervo.rpp';

describe('folios GISNET y RPP', () => {
  it('recibe cualquiera de las numeraciones mediante el mismo filtro Folio', () => {
    expect(leerInmueble({ delegacion_id: '1', folio: '107301' })).toMatchObject({ folio: '107301' });
    expect(leerInmueble({ delegacion_id: '1', folio: '509254' })).toMatchObject({ folio: '509254' });
  });

  it.each(['107301 OR 1=1', '107301%', 'ABC', '123456789012345678901'])('rechaza RPP no numérico o excesivo: %s', folio_rpp => {
    expect(() => leerInmueble({ delegacion_id: '1', folio_rpp })).toThrow();
  });

  it('rechaza un esquema inyectado y una oficina ajena a las cuatro delegaciones', () => {
    expect(() => new AcervoFoliosRpp({} as never, 'public; DROP TABLE x', 1)).toThrow();
    expect(() => new AcervoFoliosRpp({} as never, 'consulta_chetumal', 5)).toThrow();
  });
});
