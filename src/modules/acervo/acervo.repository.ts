import { Knex } from 'knex';
import { AcervoConteos, AcervoEstado, AcervoRepository } from './acervo.types';
import { AcervoOrigen, ACERVO_DEMO } from './acervo.origin';
import { AcervoStage, identificadorStage } from './acervo.stage';

interface AcervoEstadoRow extends AcervoConteos {
  base_de_datos: string;
}

interface AcervoEstadoQueryResult {
  rows: AcervoEstadoRow[];
}

export class PostgresAcervoRepository implements AcervoRepository {
  private readonly stage?: AcervoStage;
  constructor(private readonly connection: Knex, private readonly origen: AcervoOrigen = ACERVO_DEMO, stage?: AcervoStage) {
    this.stage = stage ?? (origen.modo === 'servidor' ? new AcervoStage(connection, origen) : undefined);
  }

  async obtenerEstado(): Promise<AcervoEstado> {
    if (this.stage) {
      const sesion = await this.connection.raw<{ rows: { base: string; lectura: string }[] }>(
        "SELECT current_database() AS base, current_setting('transaction_read_only') AS lectura");
      if (sesion.rows[0]?.base !== this.origen.base_de_datos || sesion.rows[0]?.lectura !== 'on') {
        throw new Error('Acervo requiere ' + this.origen.base_de_datos + ' y una conexión de solo lectura.');
      }
      const disponibles = (await this.stage.catalogo()).filter(d => d.disponible);
      if (!disponibles.length) throw new Error('No hay esquemas de Acervo compatibles. Ejecuta la comprobación del servidor de Acervo.');
      const conteos: AcervoConteos = { delegaciones: disponibles.length, folios: 0, titulares: 0, antecedentes: 0, actos: 0 };
      for (const d of disponibles) {
        const s = identificadorStage(d.esquema), oficina = d.oficina;
        const result = await this.connection.raw<{ rows: Omit<AcervoConteos, 'delegaciones'>[] }>(`SELECT
          (SELECT count(*)::integer FROM ${s}.inmobiliario WHERE nu_ofic = ${oficina}) AS folios,
          (SELECT count(*)::integer FROM ${s}.prop_inmob r JOIN ${s}.propietarios p ON p.id_prop = r.id_prop
            JOIN ${s}.inmobiliario f ON f.nu_folio = r.nu_folio AND f.nu_ofic = r.nu_ofic WHERE r.nu_ofic = ${oficina}) AS titulares,
          (SELECT count(*)::integer FROM ${s}.mesa_control m JOIN ${s}.inmobiliario f
            ON f.nu_folio = m.folio AND f.nu_ofic = m.id_ofi WHERE m.id_ofi = ${oficina}) AS antecedentes,
          (SELECT count(*)::integer FROM ${s}.mov_inmob m JOIN ${s}.inmobiliario f
            ON f.nu_folio = m.nu_folio AND f.nu_ofic = m.nu_ofic WHERE m.nu_ofic = ${oficina}) AS actos`);
        for (const campo of ['folios', 'titulares', 'antecedentes', 'actos'] as const) conteos[campo] += result.rows[0][campo];
      }
      return { estado: 'ok', modo: 'servidor', base_de_datos: this.origen.base_de_datos, conteos };
    }
    // Una sola consulta de lectura; las tablas se califican con su esquema.
    const result = await this.connection.raw<AcervoEstadoQueryResult>(`
      SELECT
        current_database() AS base_de_datos,
        (SELECT count(*)::integer FROM ${this.origen.esquema}.delegaciones
          ${this.origen.modo === 'copia_local' ? 'WHERE disponible' : ''}) AS delegaciones,
        (SELECT count(*)::integer FROM ${this.origen.esquema}.folios) AS folios,
        (SELECT count(*)::integer FROM ${this.origen.esquema}.titulares) AS titulares,
        (SELECT count(*)::integer FROM ${this.origen.esquema}.antecedentes) AS antecedentes,
        (SELECT count(*)::integer FROM ${this.origen.esquema}.actos) AS actos
    `);
    const row = result.rows[0];
    if (!row || row.base_de_datos !== this.origen.base_de_datos) {
      throw new Error('La comprobación de Acervo no está consultando la base configurada.');
    }

    return {
      estado: 'ok',
      modo: this.origen.modo,
      base_de_datos: this.origen.base_de_datos,
      conteos: {
        delegaciones: row.delegaciones,
        folios: row.folios,
        titulares: row.titulares,
        antecedentes: row.antecedentes,
        actos: row.actos,
      },
    };
  }
}
