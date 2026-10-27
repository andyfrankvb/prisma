import { describe, expect, it } from 'vitest';
import { leerInmueble } from '../../../modules/acervo/acervo.search.validation';
import { AcervoFoliosRpp } from '../../../modules/acervo/acervo.rpp';
import { filtrosInmueble, INMUEBLE_VACIO, mostrarFoliosRpp } from '../../../frontend/modules/acervo/campos';

describe('folios GISNET y RPP', () => {
  it('acepta buscar solo por RPP y combinar ambos tipos', () => {
    expect(leerInmueble({ delegacion_id: '1', folio_rpp: '107301' })).toMatchObject({ folio_rpp: '107301' });
    expect(leerInmueble({ delegacion_id: '1', folio: '509254', folio_rpp: '107301' })).toMatchObject({ folio: '509254', folio_rpp: '107301' });
  });
  it.each(['107301 OR 1=1', '107301%', 'ABC', '123456789012345678901'])('rechaza RPP no numérico o excesivo: %s', folio_rpp => {
    expect(() => leerInmueble({ delegacion_id: '1', folio_rpp })).toThrow();
  });
  it('el formulario envía los dos filtros sin confundirlos y conserva sus terminaciones', () => {
    expect(filtrosInmueble(1, { ...INMUEBLE_VACIO, folio: '9254', folio_rpp: '301' }, 1))
      .toMatchObject({ folio: '9254', folio_rpp: '301' });
  });
  it('valida RPP antes de enviar el formulario', () => {
    expect(() => filtrosInmueble(1, { ...INMUEBLE_VACIO, folio_rpp: 'ABC' }, 1)).toThrow('Folio RPP');
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
