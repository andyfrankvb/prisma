import { Knex } from 'knex';
import { ordenInmueblesSql } from './acervo.search.orden';
import type { ControlConsultaAcervo } from './acervo.search.cancelacion';
import { AppError } from '../../utils/AppError';
import { AcervoOrigen, ACERVO_DEMO } from './acervo.origin';
import { AcervoStage, FuentesAcervo, numeroStage, similitudStage, trigramasStage } from './acervo.stage';
import {
  AcervoBusqueda, AcervoDelegacion, AcervoFolioDetalle, AcervoOrden, AcervoSearchRepository,
  AcervoSugerencia, AntecedenteFiltros, AntecedenteResultado,
  InmuebleFiltros, InmuebleResultado, CAMPOS_INMUEBLE,
} from './acervo.search.types';

interface SqlResult<T> { rows: T[]; }
interface BusquedaRow<T> {
  delegacion: AcervoDelegacion | null;
  total_resultados: number;
  total_folios: number;
  resultados: T[];
  total_aproximados: number;
  aproximados: AcervoSugerencia<T>[];
  rpp_ambiguos?: number;
}
interface Regla {
  campo: string;
  columna: string;
  tipo: 'numero' | 'identificador' | 'texto' | 'propietario';
  valor: string | number;
}

const LIMITE_APROXIMADOS = 10;
const UMBRAL_APROXIMADOS = 0.35;
const CAMPOS_ANTECEDENTE = [
  'antecedente_id', 'folio_id', 'folio', 'seccion', 'tomo', 'volumen',
  'registro', 'registro_final', 'foja_inicial', 'foja_final', 'acto',
];
const CAMPOS_RESULTADO_INMUEBLE = [
  'folio_id', 'folio', 'folio_gisnet', 'propietarios', 'clave_catastral', 'superficie_total',
  'calle', 'colonia', 'lote', 'manzana', 'colindancias', 'localidad',
  'no_exterior', 'no_interior', 'super_manzana', 'fraccionamiento',
  'condominio', 'predio_conocido',
];
const IDENTIFICADORES = new Set<string>([
  'folio', 'folio_rpp', 'clave_catastral', 'lote', 'manzana', 'no_exterior', 'no_interior', 'super_manzana',
]);

// Las expresiones recibidas son columnas y alias internos, nunca texto del usuario.
// Ignora tildes en vocales, mayúsculas y espacios repetidos; conserva la Ñ.
function textoSql(expression: string): string {
  return `btrim(regexp_replace(translate(upper(coalesce(${expression}::text, '')),
    'ÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜ', 'AAAAEEEEIIIIOOOOUUUU'), '[[:space:]]+', ' ', 'g'))`;
}

function palabrasSql(expression: string): string {
  return `array_remove(regexp_split_to_array(btrim(regexp_replace(${textoSql(expression)},
    '[^[:alnum:]]+', ' ', 'g')), '[[:space:]]+'), '')`;
}

// Orden numérico ascendente sin convertir el folio visible ni perder sus ceros.
// Los valores no numéricos quedan después, con desempates estables entre páginas.
function ordenFoliosSql(alias: string): string {
  return `CASE WHEN ${alias}.folio ~ '^[0-9]+$' THEN ${alias}.folio::numeric END ASC NULLS LAST,
    ${alias}.folio, ${alias}.folio_id::bigint`;
}

// Solo estas columnas internas pueden entrar en ORDER BY. numeric conserva
// precisión y ceros visibles; 9, 9A, 10 se ordenan por número y después letra.
function ordenAntecedentesSql(alias: string, orden: AcervoOrden): string {
  const columnas: Partial<Record<AcervoOrden['campo'], string>> = {
    folio: 'folio', inscripcion: 'registro', inscripcion_final: 'registro_final',
    foja_inicial: 'foja_inicial', foja_final: 'foja_final',
  };
  const columna = Object.prototype.hasOwnProperty.call(columnas, orden.campo) ? columnas[orden.campo] : undefined;
  if (!columna || (orden.direccion !== 'asc' && orden.direccion !== 'desc')) {
    throw new AppError('El orden de antecedentes no es válido.', 400);
  }
  const direccion = orden.direccion === 'desc' ? 'DESC' : 'ASC';
  const valor = `nullif(btrim(${alias}.${columna}::text), '')`;
  const documento = orden.campo === 'inscripcion' || orden.campo === 'inscripcion_final';
  const numero = documento
    ? `CASE WHEN ${valor} ~ '^[0-9]+[A-Za-z]{0,1}$' THEN substring(${valor} FROM '^[0-9]+')::numeric END`
    : `CASE WHEN ${valor} ~ '^[0-9]+$' THEN ${valor}::numeric END`;
  const letra = documento
    ? `, CASE WHEN ${valor} ~ '^[0-9]+[A-Za-z]{0,1}$' THEN upper(regexp_replace(${valor}, '^[0-9]+', '')) END ${direccion} NULLS LAST`
    : '';
  const desempate = orden.campo === 'folio' ? `${alias}.folio_id::bigint` : ordenFoliosSql(alias);
  return `${numero} ${direccion} NULLS LAST${letra}, ${valor} ${direccion} NULLS LAST,
    ${desempate}, ${alias}.antecedente_id::bigint`;
}

function propietariosSql(origen: AcervoOrigen, fuentes: FuentesAcervo, id: string): string {
  if (origen.modo === 'servidor' && fuentes.titularesDelFolio) {
    return `coalesce((SELECT jsonb_agg(DISTINCT t.nombre ORDER BY t.nombre)
      FROM ${fuentes.titularesDelFolio(id)} t
      WHERE t.vigente IS DISTINCT FROM FALSE AND t.nombre <> ''), '[]'::jsonb)`;
  }
  return `coalesce((SELECT jsonb_agg(t.nombre ORDER BY t.nombre, t.id)
    FROM ${fuentes.titulares} t WHERE t.folio_id = ${id}), '[]'::jsonb)`;
}
function inmuebleSql(origen: AcervoOrigen, fuentes: FuentesAcervo, diferirTitulares = false): string {
  return `f.id::text AS folio_id, f.folio, f.folio AS folio_gisnet,
    ${origen.modo === 'copia_local' ? 'f.propietarios'
      : diferirTitulares ? "'[]'::jsonb" : propietariosSql(origen, fuentes, 'f.id')} AS propietarios,
    f.clave_catastral, f.superficie_total::text AS superficie_total,
    f.calle, f.colonia, f.lote, f.manzana, f.colindancias, f.localidad,
    f.no_exterior, f.no_interior, f.super_manzana, f.fraccionamiento,
    f.condominio, f.predio_conocido
    ${origen.modo !== 'demo' ? ', f.unidad_superficie' : ''}`;
}

function antecedenteSql(idFolio = 'f.id'): string {
  return `a.id::text AS antecedente_id, ${idFolio}::text AS folio_id, f.folio,
    a.seccion, a.tomo, a.volumen, a.inscripcion AS registro,
    a.inscripcion_final AS registro_final, a.foja_inicial, a.foja_final, a.acto`;
}

function reglasAntecedente(filtros: AntecedenteFiltros): Regla[] {
  const rules: Regla[] = [];
  if (filtros.seccion !== undefined) rules.push({ campo: 'seccion', columna: 'seccion', tipo: 'numero', valor: filtros.seccion });
  if (filtros.tomo !== undefined) rules.push({ campo: 'tomo', columna: 'tomo', tipo: 'identificador', valor: filtros.tomo });
  if (filtros.volumen !== undefined) rules.push({ campo: 'volumen', columna: 'volumen', tipo: 'identificador', valor: filtros.volumen });
  if (filtros.inscripcion !== undefined) rules.push({ campo: 'inscripcion', columna: 'registro', tipo: filtros.tipo_busqueda !== 'aproximada' && typeof filtros.inscripcion === 'number' ? 'numero' : 'identificador', valor: filtros.inscripcion });
  if (filtros.foja !== undefined) rules.push({ campo: 'foja', columna: 'foja_inicial', tipo: 'numero', valor: filtros.foja });
  return rules;
}

function reglasInmueble(filtros: InmuebleFiltros): Regla[] {
  const rules: Regla[] = [];
  for (const campo of CAMPOS_INMUEBLE) {
    const value = filtros[campo];
    if (value === undefined) continue;
    const tipo = campo === 'propietario' ? 'propietario'
      : campo === 'superficie_total' ? (/^\d+([.]\d+)?$/.test(value) ? 'numero' : 'identificador')
      : IDENTIFICADORES.has(campo) ? 'identificador' : 'texto';
    rules.push({ campo, columna: campo === 'folio_rpp' ? 'folio' : campo, tipo, valor: value });
  }
  return rules;
}

export class PostgresAcervoSearchRepository implements AcervoSearchRepository {
  private readonly stage?: AcervoStage;
  constructor(private readonly connection: Knex, private readonly origen: AcervoOrigen = ACERVO_DEMO, stage?: AcervoStage) {
    this.stage = stage ?? (origen.modo === 'servidor' ? new AcervoStage(connection, origen) : undefined);
  }
  private async fuentes(delegacionId: number, folioId?: string): Promise<FuentesAcervo> {
    if (this.stage) return this.stage.fuentes(delegacionId, folioId);
    const esquema = this.origen.esquema;
    return { prefijo: '', folios: esquema + '.folios', titulares: esquema + '.titulares',
      antecedentes: esquema + '.antecedentes', actos: esquema + '.actos', delegaciones: esquema + '.delegaciones',
      vinculos: esquema + '.vinculos_acto_antecedente', trigramas: true };
  }

  private comprobarDelegacion(delegacionId: number): void {
    if (this.origen.modo === 'copia_local' && delegacionId !== 4) {
      throw new AppError('Esta copia local contiene las consultas verificadas de Cozumel. Selecciona Cozumel.', 400);
    }
  }

  async delegaciones(): Promise<AcervoDelegacion[]> {
    if (this.stage) return (await this.stage.catalogo()).map(({ id, nombre, oficina, disponible, rpp_disponible }) => ({ id, nombre, oficina, disponible, rpp_disponible }));
    const result = await this.connection.raw<SqlResult<AcervoDelegacion>>(
      `SELECT id, nombre, oficina ${this.origen.modo === 'copia_local' ? ', disponible' : ''}
        FROM ${this.origen.esquema}.delegaciones ORDER BY id`,
    );
    return result.rows;
  }

  async antecedentes(filtros: AntecedenteFiltros, control?: ControlConsultaAcervo): Promise<AcervoBusqueda<AntecedenteResultado>> {
    return this.buscar<AntecedenteResultado>(filtros, reglasAntecedente(filtros), 'antecedentes', control);
  }

  async inmuebles(filtros: InmuebleFiltros, control?: ControlConsultaAcervo): Promise<AcervoBusqueda<InmuebleResultado>> {
    return this.buscar<InmuebleResultado>(filtros, reglasInmueble(filtros), 'folios', control);
  }

  private async buscar<T>(
    filtros: AntecedenteFiltros | InmuebleFiltros,
    reglas: Regla[],
    unidad: 'antecedentes' | 'folios',
    control?: ControlConsultaAcervo,
  ): Promise<AcervoBusqueda<T>> {
    this.comprobarDelegacion(filtros.delegacion_id);
    const fuentes = await this.fuentes(filtros.delegacion_id);
    const indiceRpp = reglas.findIndex(r => r.campo === 'folio_rpp');
    if (indiceRpp >= 0 && !fuentes.rpp) throw new AppError('La búsqueda por Folio RPP no está disponible para esta delegación.', 400);
    const aproximada = filtros.tipo_busqueda === 'aproximada';
    const ordenarPropietarios = unidad === 'folios' && filtros.orden_por === 'propietario';
    if (!reglas.length) throw new Error('La consulta de Acervo requiere filtros.');
    const campos = unidad === 'antecedentes' ? CAMPOS_ANTECEDENTE
      : [...CAMPOS_RESULTADO_INMUEBLE, ...(this.origen.modo !== 'demo' ? ['unidad_superficie'] : [])];
    const parametros = reglas.map((regla, index) =>
      `?::${regla.tipo === 'numero' ? 'numeric' : 'text'} AS v${index}`,
    );
    const bindings: (string | number)[] = [filtros.delegacion_id, ...reglas.map(regla => regla.valor)];
    const exactos: string[] = [];
    const afinidades: string[] = [];
    const parametrosTrigramas: string[] = [];
    const similitudManual = this.origen.modo === 'servidor' && !fuentes.trigramas;
    let propietario = '';
    let fuentesPropietario = '';
    let unionPropietario = '';
    // Los términos capturados se normalizan una vez, no por cada fila de la BD.
    const normalizados = reglas.flatMap((regla, index) => regla.tipo === 'propietario'
      ? [`${palabrasSql('entrada.v' + index)} AS terminos${index}`,
          ...(aproximada ? [`ARRAY(SELECT '(^|[^[:alnum:]])' || palabra FROM unnest(${palabrasSql('entrada.v' + index)}) palabra) AS prefijos${index}`] : [])]
      : regla.tipo === 'numero' ? [] : [`${textoSql('entrada.v' + index)} AS normal${index}`]);

    reglas.forEach((regla, index) => {
      const columna = `b.${regla.columna}`;
      const valor = `p.v${index}`;
      let exacto: string;
      let similitud: string;
      if (regla.campo === 'folio_rpp') {
        exacto = 'TRUE';
        similitud = '1::numeric';
      } else if (regla.tipo === 'propietario') {
        // Todos los términos deben estar en un solo titular. Este filtro también
        // limita las sugerencias: nunca se sustituye un apellido por otro.
        if (this.origen.modo === 'servidor' && fuentes.foliosPorPropietario) {
          fuentesPropietario = fuentes.foliosPorPropietario(nombre =>
            `cardinality(q.terminos${index}) > 0 AND ${aproximada
              ? `(${textoSql(nombre)} ~ ALL(q.prefijos${index}))`
              : `${palabrasSql(nombre)} @> q.terminos${index}`}`);
          unionPropietario = 'JOIN folios_del_propietario fp ON fp.numero_folio = f.numero_folio';
        } else {
          propietario = `AND cardinality(p.terminos${index}) > 0
          AND EXISTS (SELECT 1 FROM ${fuentes.titularesDelFolio ? fuentes.titularesDelFolio('f.id') : fuentes.titulares} t WHERE ${fuentes.titularesDelFolio ? 'TRUE' : 't.folio_id = f.id'}
            ${this.origen.modo === 'copia_local' ? 'AND t.vigente IS TRUE' : this.origen.modo === 'servidor' ? 'AND t.vigente IS DISTINCT FROM FALSE' : ''}
            AND ${aproximada
              ? `(${textoSql('t.nombre')} ~ ALL(p.prefijos${index}))`
              : this.origen.modo === 'copia_local'
                ? `acervo_prisma.palabras(t.nombre) @> acervo_prisma.palabras(${valor})`
                : `${palabrasSql('t.nombre')} @> p.terminos${index}`})`;
        }
        exacto = 'TRUE';
        similitud = '1::numeric';
      } else if (regla.tipo === 'numero') {
        const numero = this.origen.modo === 'copia_local'
          ? `acervo_prisma.numero_texto(${columna}::text)` : this.origen.modo === 'servidor' ? numeroStage(columna) : `${columna}::numeric`;
        exacto = `${numero} = ${valor}`;
        similitud = `CASE WHEN ${numero} IS NULL THEN 0::numeric
          ELSE 1::numeric / (1 + abs(${numero} - ${valor})) END`;
      } else {
        const documento = regla.campo === 'inscripcion' && this.origen.modo !== 'demo';
        // En el servidor el folio proviene de nu_folio::bigint::text: ya es
        // numérico. Evita aplicar expresiones regulares a cada folio de la oficina.
        const folioServidor = regla.campo === 'folio' && this.origen.modo === 'servidor';
        const campoNormal = folioServidor ? columna
          : documento ? `regexp_replace(${textoSql(columna)}, '^0+([0-9])', '\\1')` : textoSql(columna);
        const valorNormal = documento ? `regexp_replace(p.normal${index}, '^0+([0-9])', '\\1')` : `p.normal${index}`;
        // El folio coincide por terminación literal, conservando los ceros.
        // No interpreta comodines ni inserta el texto capturado en la sentencia.
        exacto = aproximada ? `strpos(${campoNormal}, ${valorNormal}) > 0` : regla.campo === 'folio'
          ? `right(${campoNormal}, char_length(${valorNormal})) = ${valorNormal}`
          : regla.tipo === 'texto'
            ? `strpos(${campoNormal}, ${valorNormal}) > 0`
            : `${campoNormal} = ${valorNormal}`;
        if (similitudManual) {
          parametrosTrigramas.push(`${trigramasStage(valorNormal.replace(/\bp\./g, 'entrada.'))} AS trigramas${index}`);
        }
        similitud = similitudManual
          ? similitudStage(valorNormal, campoNormal, `p.trigramas${index}`) : regla.tipo === 'texto'
          ? `public.word_similarity(${valorNormal}, ${campoNormal})::numeric`
          : `public.similarity(${campoNormal}, ${valorNormal})::numeric`;
      }
      exactos.push(`coalesce((${exacto}), FALSE) AS c${index}`);
      afinidades.push(`CASE WHEN coalesce((${exacto}), FALSE) THEN 1::numeric ELSE (${similitud}) END AS s${index}`);
    });

    const coincideTodo = reglas.map((_regla, index) => `e.c${index}`).join(' AND ');
    const puntaje = reglas.map((_regla, index) => `e.s${index}`).join(' + ');
    const alMenosSimilar = reglas.map((_regla, index) => `e.s${index} >= ${UMBRAL_APROXIMADOS}`).join(' OR ');
    const coincidentes = reglas.map((regla, index) => `CASE WHEN e.c${index} THEN '${regla.campo}'::text END`).join(', ');
    const diferentes = reglas.map((regla, index) => `CASE WHEN NOT e.c${index} THEN '${regla.campo}'::text END`).join(', ');
    const orden: AcervoOrden = { campo: filtros.orden_por ?? 'folio', direccion: filtros.orden_direccion ?? 'asc' };
    const ordenPagina = unidad === 'antecedentes' ? ordenAntecedentesSql('e', orden) : ordenInmueblesSql('e', orden);
    const ordenExacto = unidad === 'antecedentes' ? ordenAntecedentesSql('r', orden) : ordenInmueblesSql('r', orden);
    const ordenSugerencias = `e.puntaje DESC, ${ordenFoliosSql('e')}${unidad === 'antecedentes' ? ', e.antecedente_id::bigint' : ''}`;
    const offset = (filtros.pagina - 1) * filtros.tamano_pagina;
    bindings.push(filtros.tamano_pagina, offset);

    // Una sola sentencia obtiene conteos, página y sugerencias del mismo estado
    // de datos. No hay JOIN con titulares que multiplique los folios del listado.
    const agruparTitulares = this.origen.modo === 'servidor' && unidad === 'folios' && !!fuentes.titularesDeFolios;
    // Ordenar propietarios requiere sus nombres antes de LIMIT. Se agrupan en
    // conjunto para los folios coincidentes, conservando la consulta por pagina
    // para las otras columnas y para las sugerencias.
    const titularesParaOrdenar = ordenarPropietarios && agruparTitulares ? `folios_para_ordenar AS MATERIALIZED (
      SELECT folio_id::bigint / 100 AS numero_folio FROM exactos
    ), titulares_para_ordenar AS MATERIALIZED (
      SELECT t.folio_id, jsonb_agg(DISTINCT t.nombre ORDER BY t.nombre) AS propietarios
      FROM ${fuentes.titularesDeFolios!('folios_para_ordenar')} t
      WHERE t.vigente IS DISTINCT FROM FALSE AND t.nombre <> '' GROUP BY t.folio_id
    ), exactos_ordenables AS NOT MATERIALIZED (
      SELECT ${campos.map(c => c === 'propietarios'
        ? "coalesce(t.propietarios, '[]'::jsonb) AS propietarios" : 'e.' + c).join(', ')}
      FROM exactos e LEFT JOIN titulares_para_ordenar t ON t.folio_id = e.folio_id::bigint
    ), ` : '';
    const paginaCampos = campos.map(c => this.origen.modo === 'servidor' && unidad === 'folios' && !agruparTitulares && !ordenarPropietarios && c === 'propietarios'
      ? propietariosSql(this.origen, fuentes, 'e.folio_id::bigint') + ' AS propietarios' : c);
    const propietariosSugeridos = this.origen.modo === 'servidor' && unidad === 'folios' && !agruparTitulares && !ordenarPropietarios
      ? ` || jsonb_build_object('propietarios', ${propietariosSql(this.origen, fuentes, 'e.folio_id::bigint')})` : '';
    const titularesMostrados = agruparTitulares ? `, folios_mostrados AS MATERIALIZED (
      SELECT folio_id::bigint / 100 AS numero_folio FROM pagina
      UNION SELECT (resultado->>'folio_id')::bigint / 100 AS numero_folio FROM sugerencias
    ), titulares_mostrados AS MATERIALIZED (
      SELECT t.folio_id, jsonb_agg(DISTINCT t.nombre ORDER BY t.nombre) AS propietarios
      FROM ${fuentes.titularesDeFolios!('folios_mostrados')} t
      WHERE t.vigente IS DISTINCT FROM FALSE AND t.nombre <> '' GROUP BY t.folio_id
    )` : '';
    const entradaNormalizada = `SELECT entrada.*${normalizados.length ? ', ' + normalizados.join(', ') : ''} FROM parametros_entrada entrada`;
    const parametrosSql = parametrosTrigramas.length
      ? `parametros_normalizados AS (${entradaNormalizada}), parametros AS MATERIALIZED (
        SELECT entrada.*, ${parametrosTrigramas.join(', ')} FROM parametros_normalizados entrada)`
      : `parametros AS MATERIALIZED (${entradaNormalizada})`;
    // Tomos, inscripciones y fojas se repiten en muchos antecedentes. Calcula
    // coincidencia y similitud una vez por valor, conservando tambien los nulos.
    const reutilizarAfinidades = similitudManual && unidad === 'antecedentes';
    const afinidadesPorCampo = reutilizarAfinidades ? reglas.map((regla, index) => {
      const columna = `b.${regla.columna}`;
      return `valores_sugeridos${index} AS MATERIALIZED (
        SELECT DISTINCT ${columna} AS valor FROM base b
        WHERE NOT EXISTS (SELECT 1 FROM exactos)
      ), afinidad_campo${index} AS MATERIALIZED (
        SELECT d.valor, ${exactos[index].split(columna).join('d.valor')},
          ${afinidades[index].split(columna).join('d.valor')}
        FROM valores_sugeridos${index} d CROSS JOIN parametros p
      ), `;
    }).join('') : '';
    const unionesAfinidad = reutilizarAfinidades ? reglas.map((regla, index) =>
      `JOIN afinidad_campo${index} calculada${index}
        ON (calculada${index}.valor IS NULL) = (b.${regla.columna} IS NULL)
        AND coalesce(calculada${index}.valor::text, '') = coalesce(b.${regla.columna}::text, '')`).join('\n') : '';
    const columnasAfinidad = reutilizarAfinidades
      ? [...reglas.map((_regla, index) => `calculada${index}.c${index} AS c${index}`),
        ...reglas.map((_regla, index) => `calculada${index}.s${index} AS s${index}`)].join(', ')
      : afinidades.join(', ');
    const ctesRpp = indiceRpp >= 0 ? fuentes.rpp!.ctes('rpp', aproximada
      ? `strpos(q.nu_folio::bigint::text, p.normal${indiceRpp}) > 0`
      : `right(q.nu_folio::bigint::text, char_length(p.normal${indiceRpp})) = p.normal${indiceRpp}`, true) : '';
    const unionRpp = indiceRpp >= 0 ? 'JOIN folios_por_rpp fr ON fr.numero_folio = f.numero_folio' : '';
    const sql = `WITH ${fuentes.prefijoBusqueda ?? fuentes.prefijo}parametros_entrada AS (
      SELECT ?::smallint AS delegacion_id, ${parametros.join(', ')}
    ), ${parametrosSql}, ${ctesRpp}${fuentesPropietario}base AS NOT MATERIALIZED (
      SELECT ${unidad === 'antecedentes' ? antecedenteSql() : inmuebleSql(this.origen, fuentes, this.origen.modo === 'servidor' && (!ordenarPropietarios || agruparTitulares))}
      FROM ${fuentes.folios} f
      ${unidad === 'antecedentes' ? `JOIN ${fuentes.antecedentes} a ON a.folio_id = f.id` : ''}
      ${unionPropietario}
      ${unionRpp}
      CROSS JOIN parametros p
      WHERE f.delegacion_id = p.delegacion_id ${propietario}
    ), evaluados AS NOT MATERIALIZED (
      SELECT b.*, ${exactos.join(', ')}
      FROM base b CROSS JOIN parametros p
    ), exactos AS (
      SELECT e.* FROM evaluados e WHERE ${coincideTodo}
    ), ${afinidadesPorCampo}afinidades AS ${this.origen.modo === 'servidor' ? 'MATERIALIZED ' : ''}(
      SELECT b.*, ${columnasAfinidad} FROM ${reutilizarAfinidades ? 'base' : 'evaluados'} b CROSS JOIN parametros p
      ${unionesAfinidad}
      WHERE NOT EXISTS (SELECT 1 FROM exactos)
    ), candidatos AS ${this.origen.modo === 'servidor' ? 'NOT MATERIALIZED ' : ''}(
      SELECT e.*, (${puntaje}) / ${reglas.length}::numeric AS puntaje,
        array_remove(ARRAY[${coincidentes}], NULL) AS campos_coincidentes,
        array_remove(ARRAY[${diferentes}], NULL) AS campos_diferentes
      FROM afinidades e
      WHERE (${alMenosSimilar})
    ), ${titularesParaOrdenar}pagina AS (
      SELECT ${paginaCampos.join(', ')} FROM ${ordenarPropietarios && agruparTitulares ? 'exactos_ordenables' : 'exactos'} e
      ORDER BY ${ordenPagina}
      LIMIT ? OFFSET ?
    ), sugerencias AS (
      SELECT to_jsonb(e) - ARRAY[${reglas.map((_r, i) => `'c${i}', 's${i}'`).join(', ')},
        'puntaje', 'campos_coincidentes', 'campos_diferentes']::text[]${propietariosSugeridos} AS resultado,
        e.campos_coincidentes, e.campos_diferentes,
        row_number() OVER (ORDER BY ${ordenSugerencias}) AS orden
      FROM candidatos e ORDER BY ${ordenSugerencias}
      LIMIT ${LIMITE_APROXIMADOS}
    )${titularesMostrados} SELECT
      (SELECT jsonb_build_object('id', d.id, 'nombre', d.nombre, 'oficina', d.oficina)
        FROM ${fuentes.delegaciones} d WHERE d.id = p.delegacion_id) AS delegacion,
      ${indiceRpp >= 0 ? '(SELECT count(*)::integer FROM rpp_parejas WHERE NOT verificada)' : '0'} AS rpp_ambiguos,
      (SELECT count(*)::integer FROM exactos) AS total_resultados,
      (SELECT count(DISTINCT folio_id)::integer FROM exactos) AS total_folios,
      coalesce((SELECT jsonb_agg(to_jsonb(r)${agruparTitulares ? " || jsonb_build_object('propietarios', coalesce(tm.propietarios, '[]'::jsonb))" : ''}
        ORDER BY ${ordenExacto}) FROM pagina r
        ${agruparTitulares ? 'LEFT JOIN titulares_mostrados tm ON tm.folio_id = r.folio_id::bigint' : ''}), '[]'::jsonb) AS resultados,
      (SELECT count(*)::integer FROM candidatos) AS total_aproximados,
      coalesce((SELECT jsonb_agg(jsonb_build_object('resultado', s.resultado${agruparTitulares ? " || jsonb_build_object('propietarios', coalesce(tm.propietarios, '[]'::jsonb))" : ''},
        'campos_coincidentes', s.campos_coincidentes, 'campos_diferentes', s.campos_diferentes)
        ORDER BY s.orden) FROM sugerencias s
        ${agruparTitulares ? "LEFT JOIN titulares_mostrados tm ON tm.folio_id = (s.resultado->>'folio_id')::bigint" : ''}), '[]'::jsonb) AS aproximados
      FROM parametros p`;

    let result: SqlResult<BusquedaRow<T>>;
    try {
      result = control ? await control.ejecutar<SqlResult<BusquedaRow<T>>>(this.connection, sql, bindings)
        : await this.connection.raw<SqlResult<BusquedaRow<T>>>(sql, bindings);
    } catch (error) {
      if ((error as { code?: string }).code === '57014') {
        throw new AppError('PostgreSQL interrumpió la consulta. La aplicación no impone un límite de duración a las búsquedas.', 503);
      }
      throw error;
    }
    const row = result.rows[0];
    if (!row?.delegacion) throw new Error('No se encontró el catálogo de delegaciones de Acervo.');
    return {
      modo: this.origen.modo, delegacion: row.delegacion, unidad_resultado: unidad,
      ...(filtros.tipo_busqueda ? { tipo_busqueda: filtros.tipo_busqueda } : {}),
      total_resultados: row.total_resultados, total_folios: row.total_folios,
      pagina: filtros.pagina, tamano_pagina: filtros.tamano_pagina,
      paginas_totales: Math.ceil(row.total_resultados / filtros.tamano_pagina),
      orden,
      advertencia_rpp: row.rpp_ambiguos ? 'Hay coincidencias de Folio RPP cuya correspondencia requiere revisión.' : null,
      mensaje: row.total_resultados ? null : row.rpp_ambiguos
        ? 'El Folio RPP tiene correspondencias ambiguas. Se requiere verificar su antecedente.' : unidad === 'antecedentes'
        ? 'NO SE ENCONTRARON DATOS DEL ANTECEDENTE' : 'NO SE ENCONTRARON DATOS DEL INMUEBLE',
      resultados: row.resultados, total_aproximados: row.total_aproximados,
      limite_aproximados: LIMITE_APROXIMADOS, aproximados: row.aproximados,
    };
  }

  async detalle(folioId: string, delegacionId: number): Promise<AcervoFolioDetalle | null> {
    this.comprobarDelegacion(delegacionId);
    const fuentes = await this.fuentes(delegacionId, folioId);
    const result = await this.connection.raw<SqlResult<AcervoFolioDetalle>>(`WITH ${fuentes.prefijo}inmueble AS (
      SELECT ${inmuebleSql(this.origen, fuentes)} FROM ${fuentes.folios} f WHERE f.id = ?::bigint AND f.delegacion_id = ?::smallint
    ), identidad_folio AS (
      SELECT DISTINCT folio_id, folio FROM inmueble
    ), titulares AS (
      SELECT t.id::text AS id, t.nombre, t.vigente FROM ${fuentes.titulares} t
      JOIN identidad_folio i ON t.folio_id = i.folio_id::bigint ORDER BY t.nombre, t.id
    ), antecedentes AS (
      SELECT ${antecedenteSql('f.folio_id')} FROM ${fuentes.antecedentes} a
      JOIN identidad_folio f ON f.folio_id::bigint = a.folio_id
      ORDER BY a.seccion, a.tomo, a.inscripcion, a.id
    ), actos AS (
      SELECT a.id::text AS id, a.acto, a.descripcion_acto,
        a.fecha_prelacion::text AS fecha_prelacion, a.fecha_registro::text AS fecha_registro,
        a.numero_prelacion, a.numero_consecutivo, a.estatus, a.estatus_movimiento, a.id_movimiento,
        ${this.origen.modo !== 'demo'
          ? `coalesce((SELECT jsonb_agg(v.antecedente_id::text ORDER BY v.antecedente_id)
              FROM ${fuentes.vinculos} v
              WHERE v.folio_id = a.folio_id AND v.acto_id = a.id), '[]'::jsonb)`
          : "'[]'::jsonb"} AS antecedentes_ids
      FROM ${fuentes.actos} a JOIN identidad_folio i ON a.folio_id = i.folio_id::bigint
      ORDER BY a.fecha_registro ASC NULLS LAST, a.id
    ) SELECT '${this.origen.modo}'::text AS modo,
      jsonb_build_object('id', d.id, 'nombre', d.nombre, 'oficina', d.oficina) AS delegacion,
      to_jsonb(i) AS inmueble,
      coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.nombre, t.id::bigint) FROM titulares t), '[]'::jsonb) AS titulares,
      coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.seccion, a.tomo, a.registro, a.antecedente_id::bigint) FROM antecedentes a), '[]'::jsonb) AS antecedentes,
      coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.fecha_registro ASC NULLS LAST, a.id::bigint) FROM actos a), '[]'::jsonb) AS actos,
      (SELECT count(*)::integer FROM titulares) AS total_titulares,
      (SELECT count(*)::integer FROM antecedentes) AS total_antecedentes,
      (SELECT count(*)::integer FROM actos) AS total_actos
      FROM inmueble i JOIN ${fuentes.folios} f ON f.id = i.folio_id::bigint
      JOIN ${fuentes.delegaciones} d ON d.id = f.delegacion_id`, [folioId, delegacionId]);
    const detalle = result.rows[0] ?? null;
    if (detalle) {
      detalle.inmueble.folio_gisnet = detalle.inmueble.folio;
      Object.assign(detalle.inmueble, fuentes.rpp
        ? await fuentes.rpp.datos(detalle.inmueble.folio)
        : { folios_rpp: [], rpp_estado: 'no_disponible' });
    }
    return detalle;
  }
}
