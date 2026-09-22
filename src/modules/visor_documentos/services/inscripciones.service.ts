/**
 * Service: Inscripciones (modo de navegación "por inscripción")
 * File: src/modules/visor_documentos/services/inscripciones.service.ts
 *
 * Modo de búsqueda paralelo al de tomo/página — rescatado de SID
 * (LibrosService.buscarInscripcionesSid) y del catálogo `Inscripcion` de
 * VISAR, importado ahí desde Excel (Gisnet). `foja_id` ya viene resuelto
 * desde el import (ver db/import-visor-visar-testdata.mjs); aquí solo se
 * consulta.
 */
import { db } from '../../../db';
import type { VisorInscripcion, VisorInscripcionConTomo } from '../visor.types';

export async function listarInscripcionesDeTomo(tomoId: number): Promise<VisorInscripcion[]> {
  return db('visor_inscripciones').where({ tomo_id: tomoId }).orderBy('numero_inscripcion', 'asc');
}

export async function buscarInscripcion(tomoId: number, numeroInscripcion: number): Promise<VisorInscripcion | null> {
  const insc = await db('visor_inscripciones')
    .where({ tomo_id: tomoId, numero_inscripcion: numeroInscripcion })
    .first();
  return insc ?? null;
}

export interface FiltrosBusquedaInscripciones {
  delegacionId: number;
  seccionId?:   number;
  tomoQuery?:   string;
  /** Un número ("0001") o un rango ("0001_0010") — mismo formato que SID. */
  inscripcion?: string;
  limit:        number;
}

/** Búsqueda amplia tipo SID (LibrosService.buscarInscripcionesSid) — no requiere tomo preseleccionado. */
export async function buscarInscripciones(filtros: FiltrosBusquedaInscripciones): Promise<VisorInscripcionConTomo[]> {
  let query = db('visor_inscripciones as i')
    .join('visor_tomos as t', 't.id', 'i.tomo_id')
    .join('visor_secciones as s', 's.id', 't.seccion_id')
    .where('t.delegacion_id', filtros.delegacionId)
    .select(
      'i.id', 'i.tomo_id', 'i.foja_id', 'i.numero_inscripcion', 'i.volumen',
      'i.asignacion', 'i.estatus', 'i.observaciones',
      't.numero_romano', 's.numero as seccion_numero',
    )
    .orderBy(['t.indice_orden', 'i.numero_inscripcion'])
    .limit(filtros.limit);

  if (filtros.seccionId) query = query.andWhere('t.seccion_id', filtros.seccionId);
  if (filtros.tomoQuery?.trim()) query = query.andWhereRaw('UPPER(t.numero_romano) LIKE UPPER(?)', [`%${filtros.tomoQuery.trim()}%`]);

  const insc = filtros.inscripcion?.trim();
  if (insc) {
    if (insc.includes('_')) {
      const [desde, hasta] = insc.split('_').map((n) => parseInt(n, 10));
      if (Number.isInteger(desde) && Number.isInteger(hasta)) {
        query = query.andWhereBetween('i.numero_inscripcion', [Math.min(desde, hasta), Math.max(desde, hasta)]);
      }
    } else {
      const numero = parseInt(insc, 10);
      if (Number.isInteger(numero)) query = query.andWhere('i.numero_inscripcion', numero);
    }
  }

  return query;
}
