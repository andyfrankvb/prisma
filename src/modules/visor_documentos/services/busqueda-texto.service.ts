/**
 * Service: Búsqueda por el contenido de los documentos
 * File: src/modules/visor_documentos/services/busqueda-texto.service.ts
 *
 * Busca dentro del texto transcrito, no en los catálogos. Hasta ahora al Visor
 * solo se llegaba sabiendo el tomo y la inscripción; esto permite encontrar un
 * acta por lo que dice adentro —un nombre, un predio, un juzgado—, que es como
 * se busca cuando no se tiene el dato exacto.
 *
 * Sirve igual para inscripciones y para libros: lo que se indexa es la
 * transcripción de una FOJA, y una foja puede ser cualquiera de las dos. Cuando
 * la foja corresponde a una inscripción, el resultado la trae; cuando es una
 * página de libro, viene sin ella y con su número de foja.
 *
 * Solo encuentra lo que ya está transcrito. Un documento sin transcripción es
 * invisible para esta búsqueda, y por eso el resultado dice cuántos documentos
 * hay transcritos en total: sin ese dato, no encontrar nada se confunde con que
 * no exista.
 */
import { db } from '../../../db';

/** Configuración de búsqueda en español y sin acentos (ver la migración). */
const CONFIG_TEXTO = 'espanol_sin_acentos';

export interface FiltrosBusquedaTexto {
  /** Lo que se busca. Admite comillas para frase exacta y `-palabra` para excluir. */
  texto:         string;
  delegacionId?: number;
  seccionId?:    number;
  /** Claves de campaña a las que acotar; vacío = todas. */
  campanias?:    string[];
  limit:         number;
}

export interface ResultadoBusquedaTexto {
  foja_id:          number;
  tomo_id:          number;
  numero_foja:      string;
  numero_romano:    string;
  volumen:          string | null;
  delegacion:       string;
  seccion_numero:   number;
  /** La asignación cuando la foja es una inscripción; nula si es página de libro. */
  asignacion:       string | null;
  version:          string;
  campania_nombre:  string | null;
  /** El trozo del texto donde aparece lo buscado, con `<b>` en las coincidencias. */
  fragmento:        string;
  relevancia:       number;
}

export async function buscarEnTranscripciones(
  filtros: FiltrosBusquedaTexto,
): Promise<ResultadoBusquedaTexto[]> {
  const termino = filtros.texto.trim();
  if (!termino) return [];

  // `websearch_to_tsquery` y no `plainto_tsquery`: entiende comillas para frase
  // exacta y el guion para excluir, que es lo que la gente ya hace al buscar, y
  // nunca lanza error con una consulta mal formada.
  const consulta = db.raw('websearch_to_tsquery(?, ?)', [CONFIG_TEXTO, termino]);

  let query = db('visor_transcripciones_foja as t')
    .join('visor_fojas as f',        'f.id',   't.foja_id')
    .join('visor_tomos as tm',       'tm.id',  'f.tomo_id')
    .join('visor_delegaciones as d', 'd.id',   'tm.delegacion_id')
    .join('visor_secciones as s',    's.id',   'tm.seccion_id')
    .leftJoin('visor_campanias as c', 'c.clave', 't.version')
    // La inscripción es opcional: una foja de libro no tiene.
    .leftJoin('visor_inscripciones as i', 'i.foja_id', 'f.id')
    .whereRaw('t.busqueda @@ ' + consulta.toString())
    .select(
      't.foja_id', 'f.tomo_id', 'f.numero_foja',
      'tm.numero_romano', 'tm.volumen',
      'd.nombre as delegacion', 's.numero as seccion_numero',
      'i.asignacion',
      't.version', 'c.nombre as campania_nombre',
      db.raw(
        `ts_headline(?, t.texto_transcrito, ${consulta.toString()},
          'MaxWords=28, MinWords=10, MaxFragments=2, FragmentDelimiter=" … "') as fragmento`,
        [CONFIG_TEXTO],
      ),
      db.raw(`ts_rank(t.busqueda, ${consulta.toString()}) as relevancia`),
    )
    .orderBy('relevancia', 'desc')
    .limit(filtros.limit);

  if (filtros.delegacionId) query = query.andWhere('tm.delegacion_id', filtros.delegacionId);
  if (filtros.seccionId)    query = query.andWhere('tm.seccion_id', filtros.seccionId);
  if (filtros.campanias?.length) query = query.whereIn('t.version', filtros.campanias);

  return query;
}

/**
 * Cuántos documentos hay transcritos, de cuántos existen.
 *
 * La pantalla lo necesita para no engañar: una búsqueda sin resultados puede
 * significar que no existe lo buscado, o que casi nada está transcrito todavía.
 * No es lo mismo y el usuario tiene que poder distinguirlo.
 */
export async function coberturaTranscripciones(): Promise<{ transcritos: number; documentos: number }> {
  const [{ transcritos }] = await db('visor_transcripciones_foja').count({ transcritos: '*' });
  const [{ documentos }]  = await db('visor_imagenes_foja').count({ documentos: '*' });
  return { transcritos: Number(transcritos), documentos: Number(documentos) };
}
