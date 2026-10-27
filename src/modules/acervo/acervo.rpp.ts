import type { Knex } from 'knex';
import type { DatosFoliosRpp } from './acervo.search.types';

export const COLUMNAS_LISTA_RPP = ['nu_folio', 'nu_ofic', 'acto', 'nu_consec', 'tomo',
  'seccion', 'volumen', 'nu_prelac', 'foja_inicial', 'foja_final', 'fe_prelac'] as const;
const CLAVES = ['oficina', 'acto', 'consecutivo', 'tomo', 'seccion', 'volumen',
  'prelacion', 'foja_inicial', 'foja_final', 'fecha'] as const;

function esquemaSql(esquema: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(esquema)) throw new Error('El esquema de folios RPP no es válido.');
  return '"' + esquema + '"';
}
function seccion(alias: string): string {
  return `CASE WHEN btrim(${alias}.seccion::text) ~ '^[0-9]{1,2}$'
    THEN btrim(${alias}.seccion::text)::numeric END`;
}
function clave(alias: string): Record<typeof CLAVES[number], string> {
  return { oficina: `${alias}.nu_ofic`, acto: `upper(btrim(${alias}.acto::text))`,
    consecutivo: `${alias}.nu_consec`, tomo: `upper(btrim(${alias}.tomo::text))`, seccion: seccion(alias),
    volumen: `upper(btrim(${alias}.volumen::text))`, prelacion: `${alias}.nu_prelac`,
    foja_inicial: `${alias}.foja_inicial`, foja_final: `${alias}.foja_final`, fecha: `${alias}.fe_prelac` };
}
function camposClave(alias: string): string {
  const fields = clave(alias);
  return CLAVES.map(k => `${fields[k]} AS ${k}`).join(', ');
}
function coincideClave(alias: string, claves: string): string {
  const fields = clave(alias);
  return CLAVES.map(k => `${fields[k]} = ${claves}.${k}`).join(' AND ');
}
function claveCompleta(alias: string, oficina: number): string {
  return `${alias}.nu_ofic = ${oficina} AND ${alias}.nu_folio > 0
    AND ${alias}.nu_folio = trunc(${alias}.nu_folio)
    AND ${alias}.nu_consec > 0 AND ${alias}.nu_prelac > 0 AND ${alias}.fe_prelac IS NOT NULL
    AND ${alias}.foja_inicial >= 0 AND ${alias}.foja_final >= ${alias}.foja_inicial
    AND ${seccion(alias)} > 0
    AND nullif(btrim(${alias}.acto::text), '') IS NOT NULL
    AND nullif(btrim(${alias}.tomo::text), '') IS NOT NULL
    AND nullif(btrim(${alias}.volumen::text), '') IS NOT NULL`;
}

/** Lee las dos fuentes; cada antecedente debe identificar un único folio en cada lado. */
export class AcervoFoliosRpp {
  private readonly gisnet: string;
  private readonly rpp: string;
  constructor(private readonly connection: Knex, esquema: string, private readonly oficina: number) {
    if (!Number.isInteger(oficina) || oficina < 1 || oficina > 4) throw new Error('La oficina de folios RPP no es válida.');
    const schema = esquemaSql(esquema);
    this.gisnet = schema + '.lista_tomos_gisnet';
    this.rpp = schema + '.lista_tomos_rpp';
  }

  ctes(sentido: 'gisnet' | 'rpp', condicionSemilla: string, cruzarParametros = false): string {
    const source = sentido === 'gisnet' ? this.gisnet : this.rpp;
    const counterpart = sentido === 'gisnet' ? this.rpp : this.gisnet;
    const origen = sentido === 'gisnet' ? 'folio_gisnet' : 'folio_rpp';
    const destino = sentido === 'gisnet' ? 'folio_rpp' : 'folio_gisnet';
    const keys = CLAVES.join(', ');
    return `rpp_semillas AS MATERIALIZED (
      SELECT DISTINCT q.nu_folio::bigint AS numero, ${camposClave('q')}
      FROM ${source} q ${cruzarParametros ? 'CROSS JOIN parametros p' : ''}
      WHERE ${claveCompleta('q', this.oficina)} AND (${condicionSemilla})
    ), rpp_claves AS MATERIALIZED (
      SELECT DISTINCT ${keys} FROM rpp_semillas
    ), rpp_contraparte AS MATERIALIZED (
      SELECT DISTINCT q.nu_folio::bigint AS numero, ${camposClave('q')}
      FROM ${counterpart} q JOIN rpp_claves k ON ${coincideClave('q', 'k')}
      WHERE ${claveCompleta('q', this.oficina)}
    ), rpp_origenes AS MATERIALIZED (
      SELECT DISTINCT q.nu_folio::bigint AS numero, ${camposClave('q')}
      FROM ${source} q JOIN rpp_claves k ON ${coincideClave('q', 'k')}
      WHERE ${claveCompleta('q', this.oficina)}
    ), rpp_cantidad_origen AS MATERIALIZED (
      SELECT ${keys}, count(*) AS cantidad FROM rpp_origenes GROUP BY ${keys}
    ), rpp_cantidad_destino AS MATERIALIZED (
      SELECT ${keys}, count(*) AS cantidad FROM rpp_contraparte GROUP BY ${keys}
    ), rpp_parejas AS MATERIALIZED (
      SELECT DISTINCT s.numero AS ${origen}, d.numero AS ${destino},
        (co.cantidad = 1 AND cd.cantidad = 1) AS verificada
      FROM rpp_semillas s JOIN rpp_contraparte d USING (${keys})
      JOIN rpp_cantidad_origen co USING (${keys}) JOIN rpp_cantidad_destino cd USING (${keys})
    ), rpp_confirmados AS MATERIALIZED (
      SELECT DISTINCT folio_gisnet, folio_rpp FROM rpp_parejas WHERE verificada
    ), folios_por_rpp AS MATERIALIZED (
      SELECT DISTINCT folio_gisnet AS numero_folio FROM rpp_confirmados
    ), `;
  }

  async datos(folioGisnet: string): Promise<DatosFoliosRpp> {
    if (!/^\d{1,19}$/.test(folioGisnet)) throw new Error('El folio GISNET no es válido.');
    const result = await this.connection.raw<{ rows: { folios: string[]; ambiguos: number }[] }>(
      `WITH ${this.ctes('gisnet', 'q.nu_folio = ?::numeric')}resumen AS (
        SELECT DISTINCT folio_rpp FROM rpp_confirmados
      ) SELECT coalesce((SELECT jsonb_agg(folio_rpp::text ORDER BY folio_rpp) FROM resumen), '[]'::jsonb) AS folios,
        (SELECT count(*)::integer FROM rpp_parejas WHERE NOT verificada) AS ambiguos`, [folioGisnet]);
    const row = result.rows[0];
    const folios = row?.folios ?? [];
    return { folios_rpp: folios, rpp_estado: row?.ambiguos
      ? (folios.length ? 'parcial' : 'ambiguo') : (folios.length ? 'vinculado' : 'sin_coincidencia') };
  }
}
