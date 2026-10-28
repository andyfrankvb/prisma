import { describe, expect, it } from 'vitest';
import { leerInmueble } from '../../../modules/acervo/acervo.search.validation';
import { AcervoFoliosRpp } from '../../../modules/acervo/acervo.rpp';
import { CAMPOS_IDENTIFICACION, filtrosInmueble, INMUEBLE_VACIO, mostrarFoliosRpp } from '../../../frontend/modules/acervo/campos';

describe('folios GISNET y RPP', () => {
  it('recibe cualquiera de las numeraciones mediante el mismo filtro Folio', () => {
    expect(leerInmueble({ delegacion_id: '1', folio: '107301' })).toMatchObject({ folio: '107301' });
    expect(leerInmueble({ delegacion_id: '1', folio: '509254' })).toMatchObject({ folio: '509254' });
  });
  it.each(['107301 OR 1=1', '107301%', 'ABC', '123456789012345678901'])('rechaza RPP no numérico o excesivo: %s', folio_rpp => {
    expect(() => leerInmueble({ delegacion_id: '1', folio_rpp })).toThrow();
  });
  it('el formulario conserva la terminación en un único campo Folio', () => {
    const filtros = filtrosInmueble(1, { ...INMUEBLE_VACIO, folio: '301' }, 1);
    expect(filtros).toMatchObject({ folio: '301' });
    expect(filtros).not.toHaveProperty('folio_rpp');
    expect(CAMPOS_IDENTIFICACION.map(c => c.nombre)).toEqual(['folio', 'propietario', 'clave_catastral', 'superficie_total']);
  });
  it('el único campo de folio se denomina Folio', () => {
    expect(CAMPOS_IDENTIFICACION[0].etiqueta).toBe('Folio');
  });
  it('muestra todos los RPP vinculados y diferencia disponibilidad de ausencia', () => {
    expect(mostrarFoliosRpp({ rpp_estado: 'vinculado', folios_rpp: ['107301', '207301'] })).toBe('107301 · 207301');
    expect(mostrarFoliosRpp({ rpp_estado: 'sin_coincidencia', folios_rpp: [] })).toBe('Sin correspondencia identificada');
    expect(mostrarFoliosRpp({ rpp_estado: 'no_disponible', folios_rpp: [] })).toBe('No disponible');
  });
  it('no muestra candidatas ambiguas como folios confirmados', () => {
    expect(mostrarFoliosRpp({ rpp_estado: 'ambiguo', folios_rpp: ['107301'] })).toBe('Coincidencias por verificar');
    expect(mostrarFoliosRpp({ rpp_estado: 'parcial', folios_rpp: ['107301'] })).toContain('otras coincidencias por verificar');
  });
  it('rechaza un esquema inyectado y una oficina ajena a las cuatro delegaciones', () => {
    expect(() => new AcervoFoliosRpp({} as never, 'public; DROP TABLE x', 1)).toThrow();
    expect(() => new AcervoFoliosRpp({} as never, 'consulta_chetumal', 5)).toThrow();
  });
});
