/**
 * Service: Tomos del Visor de Documentos
 * File: src/modules/visor_documentos/services/tomos.service.ts
 *
 * Puerto de las consultas de TomosService (VISAR) a Knex.
 */
import { db }       from '../../../db';
import { AppError } from '../../../utils/AppError';
import type { VisorTomo, VisorFoja, VisorLibroResumen } from '../visor.types';

export async function listarTomos(delegacionId: number, seccionId: number): Promise<VisorTomo[]> {
  return db('visor_tomos')
    .where({ delegacion_id: delegacionId, seccion_id: seccionId })
    .orderBy('indice_orden', 'asc');
}

/**
 * Listado tipo "Libros Disponibles" de SID (LibrosService.obtenerLibrosConParametros):
 * un renglón por tomo con sus fojas/inscripciones ya contadas, filtrable por
 * oficina (obligatoria) + sección/tomo (opcionales, tomo por coincidencia parcial).
 */
export async function listarLibros(
  delegacionId: number,
  seccionId?: number,
  tomoQuery?: string,
): Promise<VisorLibroResumen[]> {
  let query = db('visor_tomos as t')
    .join('visor_secciones as s', 's.id', 't.seccion_id')
    .where('t.delegacion_id', delegacionId)
    .select(
      't.id',
      's.numero as seccion_numero', 's.nombre as seccion_nombre',
      't.numero_romano', 't.cajon', 't.id_libro',
      db.raw('(SELECT count(*)::int FROM visor_fojas f WHERE f.tomo_id = t.id) as total_fojas'),
      db.raw('(SELECT min(f.numero_foja) FROM visor_fojas f WHERE f.tomo_id = t.id) as foja_inicial'),
      db.raw('(SELECT max(f.numero_foja) FROM visor_fojas f WHERE f.tomo_id = t.id) as foja_final'),
      db.raw('(SELECT count(*)::int FROM visor_inscripciones i WHERE i.tomo_id = t.id) as total_inscripciones'),
    )
    .orderBy(['s.numero', 't.indice_orden']);

  if (seccionId) query = query.andWhere('t.seccion_id', seccionId);
  if (tomoQuery?.trim()) query = query.andWhereRaw('UPPER(t.numero_romano) LIKE UPPER(?)', [`%${tomoQuery.trim()}%`]);

  return query;
}

export async function buscarTomo(
  delegacionId: number,
  seccionId: number,
  numeroRomano: string,
): Promise<VisorTomo> {
  const tomo = await db('visor_tomos')
    .where({ delegacion_id: delegacionId, seccion_id: seccionId })
    .andWhereRaw('UPPER(numero_romano) = UPPER(?)', [numeroRomano])
    .first();
  if (!tomo) throw new AppError('Tomo no encontrado', 404);
  return tomo;
}

export async function listarFojasDeTomo(tomoId: number): Promise<VisorFoja[]> {
  const tomo = await db('visor_tomos').where({ id: tomoId }).first();
  if (!tomo) throw new AppError('Tomo no encontrado', 404);
  return db('visor_fojas').where({ tomo_id: tomoId }).orderBy('orden_secuencial', 'asc');
}
