import { Knex } from 'knex';
import { AppError } from '../../utils/AppError';
import { conexionGestion } from './gestion.connection';
import { ActoGestion, BusquedaGestion, ClaveGestion, ConsultaGestion, DELEGACIONES_GESTION,
  DelegacionGestion, DetalleGestion, FilaGestion, PaginaGestion, SolicitudGestion } from './gestion.types';
import { TABLAS_IMAGEN_GESTION } from './gestion.imagenes';
import type { ControlConsultaGestion } from './gestion.cancelacion';

const SOLICITUD = ['id_solicitud', 'fecha_sol', 'hora_sol', 'nu_ofic', 'seccion', 'solicitante',
  'num_esc_doc', 'notaria_auto', 'num_notaria'];
const SERVICIO = ['id_solicitud', 'fecha_sol', 'hora_sol', 'nu_ofic_sol', 'consec', 'acto',
  'nu_folio', 'nu_oficina', 'ana', 'cal', 'fec_ana', 'fec_cal', 'modulo', 'status', 'status_sol',
  'tipo_rechazo', 'motivo_rechazo'];
const PAGO = ['nu_secuen', 'nu_folio', 'nu_ofic', 'nu_consec', 'nu_prelac', 'fe_prelac',
  'hr_prelac', 'acto', 'num_recibo', 'fec_recibo', 'importe_recibo'];
const ORDEN: Record<string, string> = { prelacion: 's.id_solicitud', fecha: 's.fecha_sol',
  escritura: 's.num_esc_doc', solicitante: 's.solicitante', notaria: 's.notaria_auto', seccion: 's.seccion' };
const campos = (columns: string[], alias: string) => columns.map(c => `${alias}.${c}::text AS ${c}`).join(', ');
const fecha = (v: string | null) => v?.slice(0, 10) ?? null;
const hora = (v: string | null) => v?.split(' ')[1] ?? null;
const unicos = (values: (string | null)[]) => [...new Set(values.filter((s): s is string => s !== null && s !== ''))];

export function delegacionGestion(value: unknown): DelegacionGestion {
  const d = DELEGACIONES_GESTION.find(item => item.id === value);
  if (!d) throw new AppError('Selecciona una delegación válida.', 400);
  return d.id;
}
export function codificarClave(row: FilaGestion, d: DelegacionGestion): string {
  return Buffer.from(JSON.stringify({ d, p: row.id_solicitud, f: row.fecha_sol, h: row.hora_sol, o: row.nu_ofic })).toString('base64url');
}
export function decodificarClave(id: string, d: DelegacionGestion): ClaveGestion {
  try {
    if (!/^[A-Za-z0-9_-]{1,600}$/.test(id)) throw new Error();
    const k = JSON.parse(Buffer.from(id, 'base64url').toString('utf8'));
    const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;
    if (k.d !== d || !/^\d{1,9}$/.test(k.p) || !timestamp.test(k.f) || !timestamp.test(k.h)
      || (k.o !== null && !/^\d{1,2}$/.test(k.o))) throw new Error();
    return k;
  } catch { throw new AppError('La identidad de la solicitud no es válida para esta delegación.', 400); }
}
export function mismoServicio(s: FilaGestion, a: FilaGestion): boolean {
  return s.id_solicitud === a.id_solicitud && fecha(s.fecha_sol) === fecha(a.fecha_sol)
    && hora(s.hora_sol) === hora(a.hora_sol) && s.nu_ofic === a.nu_ofic_sol;
}
export function descripcionEstado(a: FilaGestion, catalogo: FilaGestion[]): string {
  // NULL in catalog conditions is unspecified, not a reason to discard historical rows.
  const conditions = ['modulo', 'status', 'status_sol', 'tipo_rechazo'];
  const matches = catalogo.filter(c => c.status === a.status
    && conditions.every(k => c[k] === null || c[k] === a[k]));
  const score = (c: FilaGestion) => conditions.filter(k => c[k] !== null).length;
  const max = Math.max(-1, ...matches.map(score));
  const names = unicos(matches.filter(c => score(c) === max).map(c => c.descripcion));
  return names.length === 1 ? names[0] : `Módulo ${a.modulo ?? '—'} / estatus ${a.status ?? '—'} / solicitud ${a.status_sol ?? '—'}`;
}

export class GestionRepository {
  constructor(private readonly database: Knex = conexionGestion(), private readonly control?: ControlConsultaGestion) {}

  private async lectura<T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    const ejecutar = (connection?: unknown) => this.database.transaction(async trx => {
      await trx.raw('SET TRANSACTION READ ONLY');
      const session = (await trx.raw("SELECT current_database() AS base, current_setting('transaction_read_only') AS lectura")).rows[0];
      if (session.base !== 'consultas_rppc' || session.lectura !== 'on') throw new AppError('La conexión de Gestión no corresponde al origen de solo lectura.', 503);
      return fn(trx);
    }, { isolationLevel: 'repeatable read', ...(connection ? { connection } : {}) });
    return this.control ? this.control.ejecutar(this.database, ejecutar) : ejecutar();
  }

  async delegaciones() {
    return this.lectura(async trx => {
      const rows = (await trx.raw(`SELECT table_schema FROM information_schema.columns
        WHERE table_name = 'solicitud' AND column_name = 'id_solicitud'`)).rows;
      return DELEGACIONES_GESTION.map(d => ({ ...d, disponible: rows.some((r: any) => r.table_schema === d.id) }));
    });
  }

  private async decorar(trx: Knex.Transaction, d: DelegacionGestion, rows: FilaGestion[]): Promise<DetalleGestion[]> {
    if (!rows.length) return [];
    const q = `"${d}"`;
    const ids = unicos(rows.map(s => s.id_solicitud));
    const servicios: FilaGestion[] = (await trx.raw(`SELECT ${campos(SERVICIO, 'a')} FROM ${q}.servicios_solicitud a
      WHERE a.id_solicitud = ANY(?::numeric[]) ORDER BY a.id_solicitud, a.fecha_sol, a.hora_sol, a.nu_ofic_sol, a.consec`, [ids])).rows;
    const actos: FilaGestion[] = (await trx.raw(`SELECT id_acto, desc_acto FROM ${q}.tipo_acto`)).rows;
    const estados: FilaGestion[] = (await trx.raw(`SELECT descripcion, modulo::text, status::text, status_sol::text,
      tipo_rechazo::text FROM ${q}.alert_estados`)).rows;
    const users = unicos(servicios.flatMap(a => [a.ana, a.cal]));
    const personas: FilaGestion[] = users.length ? (await trx.raw(`SELECT id_user::text, nombre, nu_oficina::text
      FROM ${q}.usuarios WHERE id_user = ANY(?::numeric[])`, [users])).rows : [];
    const haySeccion = (await trx.raw(`SELECT 1 FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'secciones' AND column_name = 'desc_seccion'`, [d])).rows.length > 0;
    const secciones: FilaGestion[] = haySeccion ? (await trx.raw(`SELECT id_seccion::text, desc_seccion FROM ${q}.secciones`)).rows : [];
    function persona(id: string | null, oficina: string | null) {
      if (id === null) return null;
      const matches = personas.filter(p => p.id_user === id);
      const locales = matches.filter(p => p.nu_oficina === oficina);
      const names = unicos((locales.length ? locales : matches).map(p => p.nombre));
      return names.length === 1 ? names[0] : `Operador ${id}`;
    }
    return rows.map(s => {
      const items: ActoGestion[] = servicios.filter(a => mismoServicio(s, a)).map(a => ({ ...a,
        acto_descripcion: unicos(actos.filter(c => c.id_acto === a.acto).map(c => c.desc_acto)).join(' / ') || a.acto || '—',
        estatus: descripcionEstado(a, estados), analista: persona(a.ana, a.nu_ofic_sol), calificador: persona(a.cal, a.nu_ofic_sol),
      } as ActoGestion));
      const seccion = unicos(secciones.filter(c => c.id_seccion === s.seccion).map(c => c.desc_seccion));
      return { solicitud: { ...s, id: codificarClave(s, d), prelacion: s.id_solicitud!,
        fecha: s.fecha_sol!, hora: s.hora_sol!, seccion_descripcion: seccion.length === 1 ? seccion[0] : `Sección ${s.seccion ?? '—'}`,
        actos_resumen: unicos(items.map(a => a.acto_descripcion)).join('; '),
        estatus_resumen: unicos(items.map(a => a.estatus)).join('; '),
        movimientos: unicos(items.map(a => a.consec)).join(', '), folios: unicos(items.map(a => a.nu_folio)).join(', '),
      } as SolicitudGestion, actos: items };
    });
  }

  async buscar(c: ConsultaGestion): Promise<BusquedaGestion> {
    const d = delegacionGestion(c.delegacion);
    const q = `"${d}"`;
    return this.lectura(async trx => {
      const order = `${ORDEN[c.orden] || ORDEN.prelacion} ${c.direccion === 'desc' ? 'DESC' : 'ASC'}, s.id_solicitud, s.fecha_sol, s.hora_sol, s.nu_ofic`;
      let where: string;
      let values: string[];
      if (c.tipo === 'folio') {
        where = `EXISTS (SELECT 1 FROM ${q}.servicios_solicitud a WHERE a.id_solicitud = s.id_solicitud
          AND a.fecha_sol::date = s.fecha_sol::date AND a.hora_sol::time = s.hora_sol::time
          AND a.nu_ofic_sol IS NOT DISTINCT FROM s.nu_ofic AND a.nu_folio = ?::numeric)`;
        values = [c.criterio];
      } else if (c.tipo === 'prelacion') { where = 's.id_solicitud = ?::numeric'; values = [c.criterio]; }
      else { where = 'upper(s.num_esc_doc) = ?'; values = [c.criterio]; }
      const page = async (predicate: string, bindings: string[], numero: number): Promise<PaginaGestion<SolicitudGestion>> => {
        const total = Number((await trx.raw(`SELECT count(*)::text AS total FROM ${q}.solicitud s WHERE ${predicate}`, bindings)).rows[0].total);
        const rows = (await trx.raw(`SELECT ${campos(SOLICITUD, 's')} FROM ${q}.solicitud s WHERE ${predicate}
          ORDER BY ${order} LIMIT ? OFFSET ?`, [...bindings, c.limite, (numero - 1) * c.limite])).rows;
        return { filas: (await this.decorar(trx, d, rows)).map(s => s.solicitud), total, pagina: numero, limite: c.limite };
      };
      const exactos = await page(where, values, c.pagina);
      const sugeridos = c.tipo === 'escritura' ? await page(
        'right(upper(s.num_esc_doc), length(?::text)) = ? AND upper(s.num_esc_doc) <> ?',
        [c.criterio, c.criterio, c.criterio], c.pagina_sugeridos) : undefined;
      return { exactos, ...(sugeridos ? { sugeridos } : {}) };
    });
  }

  private async solicitud(trx: Knex.Transaction, d: DelegacionGestion, id: string): Promise<DetalleGestion> {
    const k = decodificarClave(id, d);
    const rows = (await trx.raw(`SELECT ${campos(SOLICITUD, 's')} FROM "${d}".solicitud s
      WHERE s.id_solicitud = ?::numeric AND s.fecha_sol = ?::timestamp AND s.hora_sol = ?::timestamp
      AND s.nu_ofic IS NOT DISTINCT FROM ?::numeric LIMIT 2`, [k.p, k.f, k.h, k.o])).rows;
    if (!rows.length) throw new AppError('La solicitud no existe en la delegación seleccionada.', 404);
    if (rows.length > 1) throw new AppError('La fuente contiene solicitudes con la misma identidad completa; se requiere revisar esos registros.', 409);
    return (await this.decorar(trx, d, rows))[0];
  }
  async detalle(d: DelegacionGestion, id: string): Promise<DetalleGestion> {
    delegacionGestion(d);
    return this.lectura(trx => this.solicitud(trx, d, id));
  }

  async imagenes(d: DelegacionGestion, id: string) {
    delegacionGestion(d);
    return this.lectura(async trx => {
      const detalle = await this.solicitud(trx, d, id);
      const s = detalle.solicitud;
      const ids: string[] = [];
      for (const tabla of unicos(detalle.actos.map(a => a.acto?.trim().toLowerCase()))) {
        if (!TABLAS_IMAGEN_GESTION.includes(tabla)) continue;
        const rows: FilaGestion[] = (await trx.raw(`SELECT nu_folio::text, nu_ofic::text, nu_consec::text, id_imagen::text
          FROM "${d}"."${tabla}" WHERE nu_prelac = ?::numeric AND fe_prelac::date = ?::date AND hr_prelac::time = ?::time`,
        [s.prelacion, fecha(s.fecha_sol), hora(s.hora_sol)])).rows;
        ids.push(...unicos(rows.filter(r => detalle.actos.some(a => a.acto.trim().toLowerCase() === tabla
          && a.nu_folio === r.nu_folio && a.nu_oficina === r.nu_ofic && a.consec === r.nu_consec)).map(r => r.id_imagen)));
      }
      if (!ids.length) return [];
      return (await trx.raw(`SELECT id::text, nom_archivo FROM "${d}".imagenes
        WHERE id = ANY(?::numeric[]) AND nom_archivo IS NOT NULL ORDER BY id, nom_archivo`, [unicos(ids)])).rows;
    });
  }

  async referencias(d: DelegacionGestion, criterio: string, pagina: number, limite: number) {
    delegacionGestion(d);
    const fragmento = criterio.toUpperCase();
    return this.lectura(async trx => {
      const tablas = ['recibos_pago', 'recib_pag_bm', 'recib_pag_pm', 'recib_pag_test'];
      const q = `"${d}"`;
      // Cada conjunto de referencias se filtra una sola vez. Las claves DISTINCT
      // impiden multiplicar un pago por referencias repetidas o por ambos detalles.
      const sql = tablas.map(t => `SELECT '${t}' AS origen, ${campos(PAGO, 'p')} FROM ${q}.${t} p
        LEFT JOIN referencias_detalle r ON r.num_recibo = p.num_recibo AND r.nu_folio = p.nu_folio
          AND r.nu_consec = p.nu_consec AND r.acto = p.acto
        LEFT JOIN referencias_detalle_t rt ON rt.num_recibo = p.num_recibo AND rt.nu_folio = p.nu_folio
          AND rt.nu_consec = p.nu_consec AND rt.nu_prelac = p.nu_prelac
        WHERE strpos(upper(p.num_recibo::text), ?) > 0 OR r.num_recibo IS NOT NULL OR rt.num_recibo IS NOT NULL`
      ).join(' UNION ALL ');
      // pagos se reutiliza para el total y la pagina dentro del mismo SELECT.
      // El LEFT JOIN conserva el total incluso si no hay filas o la pagina excede el final.
      const resultado: FilaGestion[] = (await trx.raw(`WITH referencias_detalle AS (
          SELECT DISTINCT num_recibo, nu_folio, nu_consec, acto FROM ${q}.recibo_detalle
          WHERE strpos(upper(nu_refe::text), ?) > 0
        ), referencias_detalle_t AS (
          SELECT DISTINCT num_recibo, nu_folio, nu_consec, nu_prelac FROM ${q}.recibo_detalle_t
          WHERE strpos(upper(nu_refe::text), ?) > 0
        ), pagos AS (${sql})
        SELECT resumen.total, pagina.* FROM (SELECT count(*)::text AS total FROM pagos) resumen
        LEFT JOIN (SELECT * FROM pagos p
          ORDER BY p.fe_prelac::timestamp, p.hr_prelac::time, p.nu_prelac::numeric, p.nu_folio::numeric, p.nu_ofic::numeric,
            p.nu_consec::numeric, p.nu_secuen::numeric, p.origen LIMIT ? OFFSET ?
        ) pagina ON true`, [fragmento, fragmento, ...tablas.map(() => fragmento), limite, (pagina - 1) * limite])).rows;
      const total = Number(resultado[0].total);
      const pagos: FilaGestion[] = resultado.filter(p => p.origen !== null).map(({ total: _total, ...p }) => p);
      const ids = unicos(pagos.map(p => p.nu_prelac));
      const requests: FilaGestion[] = ids.length ? (await trx.raw(`SELECT ${campos(SOLICITUD, 's')} FROM ${q}.solicitud s
        WHERE s.id_solicitud = ANY(?::numeric[])`, [ids])).rows : [];
      const datos = await this.decorar(trx, d, requests);
      const filas = pagos.map(p => {
        const matches = datos.filter(item => item.solicitud.prelacion === p.nu_prelac
          && fecha(item.solicitud.fecha_sol) === fecha(p.fe_prelac) && hora(item.solicitud.hora_sol) === hora(p.hr_prelac)
          && item.actos.some(a => a.nu_folio === p.nu_folio && a.nu_oficina === p.nu_ofic && a.consec === p.nu_consec && a.acto === p.acto));
        const target = matches.length === 1 ? matches[0] : null;
        const acts = target?.actos.filter(a => a.acto === p.acto && a.nu_folio === p.nu_folio && a.consec === p.nu_consec) || [];
        return { ...p, id: target?.solicitud.id || null, prelacion: p.nu_prelac,
          fecha: p.fe_prelac, folios: p.nu_folio, movimientos: p.nu_consec,
          actos_resumen: unicos(acts.map(a => a.acto_descripcion)).join('; ') || p.acto,
          referencia_consultada: criterio, coincidencia: p.num_recibo?.toUpperCase().includes(fragmento) ? 'recibo' : 'referencia' };
      });
      return { filas, total, pagina, limite };
    });
  }
}
