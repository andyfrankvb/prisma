/**
 * Unit Tests: coincideConSujeto() — Catálogo de Vigilancia
 * File: src/tests/unit/vigilancia.matching.test.ts
 *
 * El caso que motivó estas pruebas: se dio de alta un sujeto vigilado, se
 * hizo la búsqueda en el kiosco y no llegó ninguna alerta. La causa era que
 * SID entrega el titular partido en campos y en orden propio, así que buscar
 * el nombre como cadena seguida solo funcionaba con razones sociales.
 *
 * Runner: Vitest
 */

import { describe, it, expect } from 'vitest';
import { coincideConSujeto } from '../../modules/consultas/vigilancia.matching';

/** Texto tal como lo arma el matching a partir de una búsqueda real de SID. */
const busquedaPorTitular = (nombre: string, materno: string, paterno: string) =>
  // El "61" es el tipo de persona: SID lo intercala entre el nombre y los apellidos.
  `JUAN BORGES ${nombre} 61 ${materno} ${paterno}`;

describe('coincideConSujeto', () => {
  it('detecta al titular aunque los apellidos vengan invertidos y con el código en medio', () => {
    const texto = busquedaPorTitular('ANDY FRANK', 'VARELA', 'BARBOZA');
    expect(coincideConSujeto(texto, 'ANDY FRANK BARBOZA VARELA')).toBe(true);
  });

  it('no depende de acentos ni de mayúsculas', () => {
    expect(coincideConSujeto('busqueda de Ángel Hernández', 'ANGEL HERNANDEZ')).toBe(true);
  });

  it('sigue detectando razones sociales escritas de corrido', () => {
    expect(coincideConSujeto('"TORRES MAYA" SOCIEDAD ANONIMA DE CAPITAL VARIABLE', 'TORRES MAYA')).toBe(true);
  });

  it('tolera las variantes de "S.A. DE C.V."', () => {
    const vigilado = 'TORRES MAYA S.A. DE C.V.';
    expect(coincideConSujeto('TORRES MAYA SOCIEDAD ANONIMA DE CAPITAL VARIABLE', vigilado)).toBe(true);
    expect(coincideConSujeto('"TORRES MAYA", S.A. DE C.V.', vigilado)).toBe(true);
  });

  it('exige todas las palabras: un apellido suelto no dispara la alerta', () => {
    const texto = busquedaPorTitular('MARIA', 'UITZ', 'UITZ');
    expect(coincideConSujeto(texto, 'ANDY FRANK BARBOZA VARELA')).toBe(false);
    expect(coincideConSujeto(texto, 'MARIA UITZ')).toBe(true);
  });

  it('alerta también cuando el vigilado es quien consulta, no lo consultado', () => {
    expect(coincideConSujeto('ANDY FRANK BARBOZA VARELA folio 12345', 'ANDY BARBOZA')).toBe(true);
  });

  it('ignora números y partículas cortas del nombre vigilado', () => {
    // "DE" y "LA" no deben exigirse: quien busca rara vez las escribe igual.
    expect(coincideConSujeto('CONSTRUCTORA PENINSULA MAYA', 'CONSTRUCTORA DE LA PENINSULA MAYA')).toBe(true);
  });

  it('no coincide con texto vacío ni con nombre vacío', () => {
    expect(coincideConSujeto('', 'ANDY BARBOZA')).toBe(false);
    expect(coincideConSujeto('ANDY BARBOZA', '')).toBe(false);
  });
});
