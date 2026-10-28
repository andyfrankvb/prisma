import { Request } from 'express';
import { AppError } from '../../utils/AppError';
import {
  AcervoPaginacion, AcervoOrden, AntecedenteFiltros, InmuebleFiltros,
  CAMPOS_INMUEBLE, CAMPOS_ORDEN_ANTECEDENTE, CAMPOS_ORDEN_INMUEBLE,
} from './acervo.search.types';

type Query = Request['query'];

function validarClaves(query: Query, permitidas: readonly string[]): void {
  for (const [key, value] of Object.entries(query)) {
    if (!permitidas.includes(key)) throw new AppError(`Campo de búsqueda no reconocido: ${key}`, 400);
    if (typeof value !== 'string') throw new AppError(`El campo ${key} debe enviarse una sola vez como texto.`, 400);
    if (value.length > 1000) throw new AppError(`El campo ${key} es demasiado largo.`, 400);
  }
}

function texto(query: Query, campo: string, max = 200): string | undefined {
  const value = query[campo];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new AppError(`El campo ${campo} debe ser texto.`, 400);
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) return undefined;
  if (cleaned.length > max) throw new AppError(`El campo ${campo} admite hasta ${max} caracteres.`, 400);
  return cleaned;
}

function entero(query: Query, campo: string, max: number, requerido = false): number | undefined {
  const value = texto(query, campo, 20);
  if (value === undefined) {
    if (requerido) throw new AppError(`Debes indicar ${campo}.`, 400);
    return undefined;
  }
  if (!/^\d+$/.test(value)) throw new AppError(`El campo ${campo} debe ser un entero positivo.`, 400);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new AppError(`El campo ${campo} debe estar entre 1 y ${max}.`, 400);
  }
  return parsed;
}

export function leerDelegacion(query: Query): number {
  return entero(query, 'delegacion_id', 4, true)!;
}

function inscripcion(query: Query): number | string | undefined {
  const value = texto(query, 'inscripcion', 20);
  if (value === undefined) return undefined;
  if (/^\d+$/.test(value)) return entero(query, 'inscripcion', 2147483647);
  if (/^\d{1,8}[A-Za-z]$/.test(value)) return value.toUpperCase();
  throw new AppError('Inscripción debe ser un número o un número seguido de una letra.', 400);
}

function paginacion(query: Query): AcervoPaginacion {
  const tipo = texto(query, 'tipo_busqueda', 20);
  if (tipo !== undefined && tipo !== 'precisa' && tipo !== 'aproximada') {
    throw new AppError('El tipo de búsqueda debe ser precisa o aproximada.', 400);
  }
  return {
    ...(tipo ? { tipo_busqueda: tipo as AcervoPaginacion['tipo_busqueda'] } : {}),
    pagina: entero(query, 'pagina', 1000000) ?? 1,
    tamano_pagina: entero(query, 'tamano_pagina', 100) ?? 25,
  };
}

export function leerAntecedente(query: Query): AntecedenteFiltros {
  validarClaves(query, ['delegacion_id', 'pagina', 'tamano_pagina', 'seccion', 'tomo', 'volumen', 'inscripcion', 'foja', 'orden_por', 'orden_direccion', 'tipo_busqueda']);
  const campo = texto(query, 'orden_por', 30) ?? 'folio';
  const direccion = texto(query, 'orden_direccion', 10)?.toLowerCase() ?? 'asc';
  if (!CAMPOS_ORDEN_ANTECEDENTE.some(permitido => permitido === campo)) {
    throw new AppError('Ordena por Folio, F.R.E., Inscripción, Inscripción final, Foja inicial o Foja final.', 400);
  }
  if (direccion !== 'asc' && direccion !== 'desc') {
    throw new AppError('La dirección del orden debe ser asc o desc.', 400);
  }
  const filtros: AntecedenteFiltros = {
    delegacion_id: leerDelegacion(query), ...paginacion(query),
    seccion: entero(query, 'seccion', 9),
    tomo: texto(query, 'tomo', 40),
    volumen: texto(query, 'volumen', 80),
    inscripcion: inscripcion(query),
    foja: entero(query, 'foja', 2147483647),
    orden_por: campo as AntecedenteFiltros['orden_por'], orden_direccion: direccion,
  };
  if ([filtros.seccion, filtros.tomo, filtros.volumen, filtros.inscripcion, filtros.foja].every(value => value === undefined)) {
    throw new AppError('Ingresa al menos un dato del antecedente además de la delegación.', 400);
  }
  return filtros;
}

export function leerInmueble(query: Query): InmuebleFiltros {
  validarClaves(query, ['delegacion_id', 'pagina', 'tamano_pagina', 'tipo_busqueda', 'orden_por', 'orden_direccion', ...CAMPOS_INMUEBLE]);
  const campo = texto(query, 'orden_por', 30) ?? 'folio';
  const direccion = texto(query, 'orden_direccion', 10)?.toLowerCase() ?? 'asc';
  if (!CAMPOS_ORDEN_INMUEBLE.some(permitido => permitido === campo)) {
    throw new AppError('La columna para ordenar los inmuebles no es válida.', 400);
  }
  if (direccion !== 'asc' && direccion !== 'desc') {
    throw new AppError('La dirección del orden debe ser asc o desc.', 400);
  }
  const filtros: InmuebleFiltros = { delegacion_id: leerDelegacion(query), ...paginacion(query),
    orden_por: campo as InmuebleFiltros['orden_por'], orden_direccion: direccion };
  for (const campo of CAMPOS_INMUEBLE) {
    const value = texto(query, campo, campo === 'colindancias' ? 1000 : 200);
    if (value === undefined) continue;
    if (campo === 'superficie_total') {
      filtros[campo] = /^\d+([.,]\d+)?$/.test(value) ? value.replace(',', '.') : value;
    } else {
      if (campo === 'propietario' && !/[\p{L}\p{N}]/u.test(value)) {
        throw new AppError('Propietario debe contener al menos una palabra o número.', 400);
      }
      filtros[campo] = value;
    }
  }
  if (CAMPOS_INMUEBLE.every(campo => filtros[campo] === undefined)) {
    throw new AppError('Ingresa al menos un dato del inmueble además de la delegación.', 400);
  }
  return filtros;
}

export function leerDetalle(folioId: string, query: Query): { folioId: string; delegacionId: number } {
  validarClaves(query, ['delegacion_id']);
  if (!/^\d{1,19}$/.test(folioId) || BigInt(folioId) < 1n || BigInt(folioId) > 9223372036854775807n) {
    throw new AppError('El identificador interno del folio es inválido.', 400);
  }
  return { folioId: BigInt(folioId).toString(), delegacionId: leerDelegacion(query) };
}
