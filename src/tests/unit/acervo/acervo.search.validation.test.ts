import { describe, expect, it } from 'vitest';
import { leerAntecedente, leerDetalle, leerInmueble } from '../../../modules/acervo/acervo.search.validation';

describe('filtros de Acervo', () => {
  it('admite sección 01 y campos opcionales vacíos', () => {
    expect(leerAntecedente({ delegacion_id: '1', seccion: '01', tomo: ' x ', volumen: '', foja: ' ' }))
      .toMatchObject({ seccion: 1, tomo: 'x', volumen: undefined, foja: undefined, pagina: 1, tamano_pagina: 25 });
  });

  it('conserva ceros del folio y decimales sin convertirlos a punto flotante', () => {
    expect(leerInmueble({ delegacion_id: '4', folio: '000777', superficie_total: '2875,8625' }))
      .toMatchObject({ folio: '000777', superficie_total: '2875.8625' });
  });

  it('conserva todos los términos del propietario', () => {
    expect(leerInmueble({ delegacion_id: '1', propietario: '  Juana   Pérez Gómez  ' }).propietario)
      .toBe('Juana Pérez Gómez');
  });

  it.each([
    {}, { delegacion_id: '0', tomo: 'X' }, { delegacion_id: '5', tomo: 'X' },
    { delegacion_id: '1' }, { delegacion_id: '1', seccion: '10' },
    { delegacion_id: '1', inscripcion: '7.5' }, { delegacion_id: '1', foja: '-1' },
    { delegacion_id: '1', registro: '7' }, { delegacion_id: '1', oficina: '2', tomo: 'X' },
    { delegacion_id: '1', tomo: ['X', 'XX'] }, { delegacion_id: '1', tomo: { dato: 'X' } },
    { delegacion_id: '1', tomo: 'X', tamano_pagina: '101' },
  ])('rechaza una consulta de antecedente inválida (%#)', query => {
    expect(() => leerAntecedente(query)).toThrow();
  });

  it.each([
    { delegacion_id: '1' }, { delegacion_id: '1', propietario: '%%%' },
    { delegacion_id: '1', folio: '1', orden_por: 'columna_inexistente' },
    { delegacion_id: '1', folio: '1', orden_direccion: 'desc;--' },
    { delegacion_id: '1', folio: ['1', '2'] },
    { delegacion_id: '1', folio: '000777', pagina: '0' },
  ])('rechaza una consulta de inmueble inválida (%#)', query => {
    expect(() => leerInmueble(query)).toThrow();
  });

  it('valida el identificador bigint sin pérdida de precisión', () => {
    expect(leerDetalle('9223372036854775807', { delegacion_id: '1' }).folioId)
      .toBe('9223372036854775807');
    expect(() => leerDetalle('9223372036854775808', { delegacion_id: '1' })).toThrow();
    expect(() => leerDetalle('0', { delegacion_id: '1' })).toThrow();
  });
});
