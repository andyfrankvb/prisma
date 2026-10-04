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
  /**
   * Claves de campaña a las que acotar la búsqueda. Vacío o sin definir = todas.
   * Acotar NO oculta el desglose: el tomo sigue mostrando de qué campañas tiene
   * documentos, y lo que cambia es qué tomos entran en el resultado.
   */
  campanias?: string[],
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
      // Qué digitalizaciones aportaron documentos a este tomo, y cuántos cada
      // una. Va aquí, en el listado, porque es justo lo que el usuario necesita
      // ANTES de abrir: un tomo puede tener documentos de varias campañas y
      // ninguna contiene a la otra.
      // Se listan TODAS las campañas activas, con su conteo, aunque sea cero.
      // Un cero no es lo mismo que una ausencia: dice "de esta campaña no hay
      // nada para este tomo", y junto con `estado` distingue el caso de "esa
      // campaña todavía no se carga".
      db.raw(`(
        SELECT coalesce(json_agg(x ORDER BY x.orden), '[]'::json) FROM (
          SELECT c.clave, c.nombre, c.anio, c.orden, c.estado,
                 (SELECT count(*)::int
                    FROM visor_fojas f
                    JOIN visor_imagenes_foja i ON i.foja_id = f.id
                   WHERE f.tomo_id = t.id AND i.version = c.clave) AS documentos
            FROM visor_campanias c
           WHERE c.activo
        ) x
      ) as campanias`),
    )
    .orderBy(['s.numero', 't.indice_orden']);

  if (seccionId) query = query.andWhere('t.seccion_id', seccionId);
  if (tomoQuery?.trim()) query = query.andWhereRaw('UPPER(t.numero_romano) LIKE UPPER(?)', [`%${tomoQuery.trim()}%`]);

  if (campanias?.length) {
    query = query.whereExists(function () {
      this.select(db.raw('1'))
        .from('visor_fojas as ff')
        .join('visor_imagenes_foja as ii', 'ii.foja_id', 'ff.id')
        .whereRaw('ff.tomo_id = t.id')
        .whereIn('ii.version', campanias);
    });
  }

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
