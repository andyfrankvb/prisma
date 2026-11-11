/**
 * Pruebas: campos y formateadores del Acervo
 * File: frontend/src/modules/acervo/campos.test.ts
 *
 * Estas cuatro pruebas vivían en `src/tests/unit/acervo/acervo.rpp.test.ts`, en
 * el backend, junto a otras tres que sí son suyas. Estaban ahí porque el
 * frontend no tenía corredor de pruebas, no porque compartieran código: ninguna
 * de las siete usaba los dos lados a la vez.
 *
 * Las tres del backend se quedaron allá, con `leerInmueble` y `AcervoFoliosRpp`.
 * Estas cuatro —formulario y presentación— viven aquí, junto a lo que prueban.
 */

import { describe, expect, it } from 'vitest';
import { CAMPOS_IDENTIFICACION, filtrosInmueble, INMUEBLE_VACIO, mostrarFoliosRpp } from './campos';

describe('formulario de identificación del inmueble', () => {
  it('el formulario conserva la terminación en un único campo Folio', () => {
    const filtros = filtrosInmueble(1, { ...INMUEBLE_VACIO, folio: '301' }, 1);
    expect(filtros).toMatchObject({ folio: '301' });
    expect(filtros).not.toHaveProperty('folio_rpp');
    expect(CAMPOS_IDENTIFICACION.map(c => c.nombre)).toEqual(['folio', 'propietario', 'clave_catastral', 'superficie_total']);
  });

  it('el único campo de folio se denomina Folio', () => {
    expect(CAMPOS_IDENTIFICACION[0].etiqueta).toBe('Folio');
  });
});

describe('presentación de folios RPP', () => {
  it('muestra todos los RPP vinculados y diferencia disponibilidad de ausencia', () => {
    expect(mostrarFoliosRpp({ rpp_estado: 'vinculado', folios_rpp: ['107301', '207301'] })).toBe('107301 · 207301');
    expect(mostrarFoliosRpp({ rpp_estado: 'sin_coincidencia', folios_rpp: [] })).toBe('Sin correspondencia identificada');
    expect(mostrarFoliosRpp({ rpp_estado: 'no_disponible', folios_rpp: [] })).toBe('No disponible');
  });

  it('no muestra candidatas ambiguas como folios confirmados', () => {
    expect(mostrarFoliosRpp({ rpp_estado: 'ambiguo', folios_rpp: ['107301'] })).toBe('Coincidencias por verificar');
    expect(mostrarFoliosRpp({ rpp_estado: 'parcial', folios_rpp: ['107301'] })).toContain('otras coincidencias por verificar');
  });
});
