import { Knex } from 'knex';
import { AppError } from '../../utils/AppError';
import type { AcervoOrigen } from './acervo.origin';
import type { AcervoDelegacion } from './acervo.search.types';

export interface FuentesAcervo {
  prefijo: string;
  prefijoBusqueda?: string;
  folios: string;
  titulares: string;
  antecedentes: string;
  actos: string;
  delegaciones: string;
  vinculos: string;
  trigramas: boolean;
  titularesDelFolio?: (folioId: string) => string;
  foliosPorPropietario?: (coincideNombre: (nombre: string) => string) => string;
  titularesDeFolios?: (folios: string) => string;
}
interface PerfilStage extends AcervoDelegacion { esquema: string; estatusTitular: boolean; motivo?: string; }
interface ColumnasRow { table_schema: string; table_name: string; column_name: string; }
interface SqlResult<T> { rows: T[]; }
const DELEGACIONES = [
  { id: 1, nombre: 'Chetumal', oficina: 1 }, { id: 2, nombre: 'Cancún', oficina: 2 },
  { id: 3, nombre: 'Playa del Carmen', oficina: 3 }, { id: 4, nombre: 'Cozumel', oficina: 4 },
];
const NECESARIAS: Record<string, string[]> = {
  oficinas: ['id_oficina', 'nom_oficina'],
  inmobiliario: ['nu_folio', 'nu_ofic', 'expcat', 'superficie_total', 'unidad_medida', 'calle', 'colonia', 'lote',
    'manzana', 'medcol', 'localidad', 'num_ext', 'num_int', 'supermanzana', 'fraccionamiento', 'condominio', 'predio_conocido'],
  propietarios: ['id_prop', 'nom_tit', 'patern', 'matern'],
  prop_inmob: ['nu_folio', 'nu_ofic', 'id_prop', 'nu_secuen'],
  mesa_control: ['id_mc', 'folio', 'id_ofi', 'seccion', 'tomo', 'volumen', 'doc_inicial', 'doc_final',
    'foja_inicial', 'foja_final', 'acto', 'consecutivo', 'fecha_insc'],
  mov_inmob: ['nu_folio', 'nu_ofic', 'nu_consec', 'nu_prelac', 'fe_prelac', 'hr_prelac', 'fe_regist',
    'acto', 'status', 'status_mov', 'id_mov'],
  tipo_acto: ['id_acto', 'desc_acto'], unidades_medida: ['id_unidad', 'desc_unidad'],
};
export function identificadorStage(valor: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(valor)) throw new Error('El nombre del esquema de Acervo no es válido.');
  return '"' + valor + '"';
}
export function numeroStage(expresion: string): string {
  return `CASE WHEN btrim(${expresion}::text) ~ '^[0-9]+([.,][0-9]+){0,1}$'
    THEN replace(btrim(${expresion}::text), ',', '.')::numeric END`;
}
export function trigramasStage(expresion: string): string {
  return `ARRAY(SELECT DISTINCT substring(v FROM i FOR 3)
    FROM (SELECT '  ' || ${expresion} || ' ' AS v) x CROSS JOIN LATERAL generate_series(1, char_length(v) - 2) i)`;
}
/** Alternativa de lectura cuando el servidor no tiene pg_trgm en public. */
export function similitudStage(izquierda: string, derecha: string, trigramasEntrada?: string): string {
  return `(WITH trigramas AS MATERIALIZED (
    SELECT ${trigramasEntrada ?? trigramasStage(izquierda)} AS x, ${trigramasStage(derecha)} AS y
  ) SELECT CASE WHEN greatest(cardinality(x), cardinality(y)) = 0 THEN 0::numeric
    ELSE (SELECT count(*)::numeric FROM unnest(x) AS comun(trigrama) WHERE trigrama = ANY(y))
      / greatest(cardinality(x), cardinality(y)) END
    FROM trigramas)`;
}

/** Solo lee catálogos y tablas; no instala funciones, vistas ni extensiones. */
export class AcervoStage {
  private perfiles?: Promise<PerfilStage[]>;
  private trigramas = false;
  constructor(private readonly connection: Knex, private readonly origen: AcervoOrigen) {}

  private async comprobar(): Promise<PerfilStage[]> {
    const esquemas = DELEGACIONES.map(d => this.origen.esquemas?.[d.id] ?? '');
    esquemas.forEach(identificadorStage);
    const columnas = await this.connection.raw<SqlResult<ColumnasRow>>(`SELECT table_schema, table_name, column_name
      FROM information_schema.columns WHERE table_schema IN (${esquemas.map(() => '?').join(',')})
      AND table_name IN (${Object.keys(NECESARIAS).map(() => '?').join(',')})`, [...esquemas, ...Object.keys(NECESARIAS)]);
    const extension = await this.connection.raw<SqlResult<{ disponible: boolean }>>(`SELECT
      to_regprocedure('public.similarity(text,text)') IS NOT NULL
      AND to_regprocedure('public.word_similarity(text,text)') IS NOT NULL AS disponible`);
    this.trigramas = extension.rows[0]?.disponible === true;
    const perfiles: PerfilStage[] = [];
    for (const d of DELEGACIONES) {
      const esquema = this.origen.esquemas![d.id];
      const campos = new Set(columnas.rows.filter(c => c.table_schema === esquema).map(c => c.table_name + '.' + c.column_name));
      const faltan = Object.entries(NECESARIAS).flatMap(([t, cols]) => cols.filter(c => !campos.has(t + '.' + c)).map(c => t + '.' + c));
      let motivo = faltan.length ? 'Faltan columnas: ' + faltan.join(', ') : undefined;
      if (!motivo) {
        const oficina = await this.connection.raw<SqlResult<{ nombre: string }>>(
          `SELECT nom_oficina::text AS nombre FROM ${identificadorStage(esquema)}.oficinas WHERE id_oficina = ?`, [d.oficina]);
        const nombre = oficina.rows[0]?.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() ?? '';
        const esperado = d.id === 2 ? 'CANCUN' : d.id === 3 ? 'PLAYA' : d.nombre.toUpperCase();
        if (oficina.rows.length !== 1 || !nombre.includes(esperado)) motivo = 'El catálogo oficinas no confirma la delegación ' + d.oficina + '.';
      }
      perfiles.push({ ...d, esquema, estatusTitular: campos.has('prop_inmob.status'), disponible: !motivo, ...(motivo ? { motivo } : {}) });
    }
    return perfiles;
  }
  async catalogo(): Promise<PerfilStage[]> {
    if (!this.perfiles) this.perfiles = this.comprobar().catch(error => { this.perfiles = undefined; throw error; });
    return this.perfiles;
  }
  async fuentes(delegacionId: number, folioId?: string): Promise<FuentesAcervo> {
    const perfil = (await this.catalogo()).find(d => d.id === delegacionId);
    if (!perfil) throw new AppError('La delegación de Acervo no es válida.', 400);
    if (!perfil.disponible) throw new AppError(perfil.nombre + ': ' + perfil.motivo, 503);
    const s = identificadorStage(perfil.esquema), oficina = perfil.oficina;
    if (folioId !== undefined && !/^\d{1,19}$/.test(folioId)) throw new AppError('El folio no es válido.', 400);
    const numeroFolio = folioId === undefined ? '' : (BigInt(folioId) / 100n).toString();
    const filtro = (alias: string, campo = 'nu_folio') => numeroFolio ? `AND ${alias}.${campo} = ${numeroFolio}::numeric` : '';
    const nombre = `btrim(concat_ws(' ', nullif(btrim(p.nom_tit), ''), nullif(btrim(p.patern), ''), nullif(btrim(p.matern), '')))`;
    const vigente = perfil.estatusTitular ? 'CASE WHEN r.status = 1 THEN TRUE WHEN r.status = 0 THEN FALSE ELSE NULL END' : 'NULL::boolean';
    const prefijoBusqueda = `acervo_delegaciones AS (SELECT ${oficina}::integer AS id, '${perfil.nombre}'::text AS nombre, ${oficina}::integer AS oficina),
    acervo_folios AS NOT MATERIALIZED (
      SELECT (f.nu_folio * 100 + f.nu_ofic)::bigint AS id, ${oficina}::smallint AS delegacion_id,
        f.nu_folio AS numero_folio, f.nu_folio::bigint::text AS folio, nullif(btrim(f.expcat), '') AS clave_catastral,
        nullif(btrim(f.superficie_total), '') AS superficie_total,
        CASE f.unidad_medida WHEN 1 THEN 'm²' WHEN 2 THEN 'ha' WHEN 3 THEN 'dm²' WHEN 4 THEN 'cm²'
          WHEN 5 THEN 'm' ELSE nullif(btrim(u.desc_unidad), '') END AS unidad_superficie,
        nullif(btrim(f.calle), '') AS calle, nullif(btrim(f.colonia), '') AS colonia,
        nullif(btrim(f.lote), '') AS lote, nullif(btrim(f.manzana), '') AS manzana,
        nullif(btrim(f.medcol), '') AS colindancias, nullif(btrim(f.localidad), '') AS localidad,
        nullif(btrim(f.num_ext), '') AS no_exterior, nullif(btrim(f.num_int), '') AS no_interior,
        nullif(btrim(f.supermanzana), '') AS super_manzana, nullif(btrim(f.fraccionamiento), '') AS fraccionamiento,
        nullif(btrim(f.condominio), '') AS condominio, nullif(btrim(f.predio_conocido), '') AS predio_conocido
      FROM ${s}.inmobiliario f LEFT JOIN ${s}.unidades_medida u ON u.id_unidad = f.unidad_medida
      WHERE f.nu_ofic = ${oficina} ${filtro('f')}
    ), acervo_titulares AS NOT MATERIALIZED (
      SELECT row_number() OVER (PARTITION BY r.nu_folio, r.nu_ofic ORDER BY r.id_prop, r.nu_secuen, ${nombre})::bigint AS id,
        (r.nu_folio * 100 + r.nu_ofic)::bigint AS folio_id, ${nombre} AS nombre, ${vigente} AS vigente
      FROM ${s}.prop_inmob r JOIN ${s}.propietarios p ON p.id_prop = r.id_prop
      WHERE r.nu_ofic = ${oficina} ${filtro('r')}
    ), acervo_antecedentes AS NOT MATERIALIZED (
      SELECT m.id_mc::bigint AS id, (m.folio * 100 + m.id_ofi)::bigint AS folio_id,
        CASE WHEN btrim(m.seccion) ~ '^[0-9]{1,2}$' THEN btrim(m.seccion)::integer END AS seccion,
        nullif(btrim(m.tomo), '') AS tomo, nullif(btrim(m.volumen), '') AS volumen,
        nullif(btrim(m.doc_inicial), '') AS inscripcion, nullif(btrim(m.doc_final), '') AS inscripcion_final,
        m.foja_inicial::integer AS foja_inicial, m.foja_final::integer AS foja_final,
        nullif(btrim(m.acto), '') AS acto, m.consecutivo::integer AS consecutivo, m.fecha_insc::date AS fecha_insc
      FROM ${s}.mesa_control m WHERE m.id_ofi = ${oficina} ${filtro('m', 'folio')}
    ), `;
    const prefijo = prefijoBusqueda + `acervo_actos AS MATERIALIZED (
      SELECT row_number() OVER (PARTITION BY m.nu_folio, m.nu_ofic
        ORDER BY m.nu_prelac, m.nu_consec, m.fe_prelac, m.hr_prelac, m.fe_regist, m.acto, m.id_mov, m.status, m.status_mov)::bigint AS id,
        (m.nu_folio * 100 + m.nu_ofic)::bigint AS folio_id,
        m.acto, nullif(btrim(t.desc_acto), '') AS descripcion_acto,
        m.fe_prelac::date AS fecha_prelacion, m.fe_regist::date AS fecha_registro,
        m.nu_prelac::text AS numero_prelacion, m.nu_consec::integer AS numero_consecutivo,
        m.status AS estatus, m.status_mov AS estatus_movimiento, m.id_mov::text AS id_movimiento
      FROM ${s}.mov_inmob m LEFT JOIN ${s}.tipo_acto t ON t.id_acto = m.acto
      WHERE m.nu_ofic = ${oficina} ${filtro('m')}
    ), acervo_vinculos AS (
      SELECT acto_id, antecedente_id, folio_id FROM (
        SELECT a.id AS acto_id, n.id AS antecedente_id, n.folio_id,
          count(*) OVER (PARTITION BY n.folio_id, n.id) AS coincidencias
        FROM acervo_actos a JOIN acervo_antecedentes n ON n.folio_id = a.folio_id
          AND upper(btrim(n.acto)) = upper(btrim(a.acto))
        WHERE n.consecutivo = a.numero_consecutivo AND n.fecha_insc = a.fecha_registro
          AND CASE WHEN btrim(n.inscripcion) ~ '^[0-9]+$' THEN n.inscripcion::numeric END = ${numeroStage('a.numero_prelacion')}
      ) candidatos WHERE coincidencias = 1
    ), `;
    const titularesDelFolio = (id: string) => `(SELECT ${nombre} AS nombre, ${vigente} AS vigente
      FROM ${s}.prop_inmob r JOIN ${s}.propietarios p ON p.id_prop = r.id_prop
      WHERE r.nu_ofic = ${oficina} AND r.nu_folio = (${id}) / 100)`;
    // Filtra nombres una sola vez y después obtiene sus folios. La unión conserva
    // nu_folio sin transformar para aprovechar los índices que tenga la fuente.
    const foliosPorPropietario = (coincideNombre: (columna: string) => string) => `
      propietarios_coincidentes AS MATERIALIZED (
        SELECT DISTINCT p.id_prop FROM ${s}.propietarios p CROSS JOIN parametros q
        WHERE ${coincideNombre(nombre)}
      ), folios_del_propietario AS MATERIALIZED (
        SELECT DISTINCT r.nu_folio AS numero_folio FROM ${s}.prop_inmob r
        JOIN propietarios_coincidentes pc ON pc.id_prop = r.id_prop
        WHERE r.nu_ofic = ${oficina} AND (${vigente}) IS DISTINCT FROM FALSE
      ), `;
    // Obtiene los titulares de los folios mostrados en un conjunto, en lugar de
    // ejecutar una subconsulta independiente por cada fila de la página.
    const titularesDeFolios = (folios: string) => `(SELECT
      (r.nu_folio * 100 + r.nu_ofic)::bigint AS folio_id, ${nombre} AS nombre, ${vigente} AS vigente
      FROM ${s}.prop_inmob r JOIN ${folios} seleccion ON seleccion.numero_folio = r.nu_folio
      JOIN ${s}.propietarios p ON p.id_prop = r.id_prop
      WHERE r.nu_ofic = ${oficina})`;
    return { titularesDelFolio, foliosPorPropietario, titularesDeFolios, prefijo, prefijoBusqueda, folios: 'acervo_folios', titulares: 'acervo_titulares', antecedentes: 'acervo_antecedentes',
      actos: 'acervo_actos', delegaciones: 'acervo_delegaciones', vinculos: 'acervo_vinculos', trigramas: this.trigramas };
  }
}
