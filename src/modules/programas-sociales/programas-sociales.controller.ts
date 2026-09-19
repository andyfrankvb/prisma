/**
 * Controller: Programas Sociales (INFONAVIT/FOVISSSTE, INSUS, AGEPROO, SEDETUS,
 * Vivienda Bienestar, Regularización Bienestar Patrimonial, Acciones
 * Urbanísticas y Vivienda Social, Regulariza Tu Propiedad, PAE RPP SATQ, RPP RAN)
 * File: src/modules/programas-sociales/programas-sociales.controller.ts
 *
 * Cruza dos universos que hasta ahora vivían separados:
 *   - Dinero (SATQ):         satq_ingresos + satq_catalogo_conceptos → de qué
 *                             programa es cada peso, conciliado o no con RPP.
 *   - Productividad (RPP):   productividad_ingresos/_bandeja/_terminados → en
 *                             qué delegación, cuándo entró, cuándo se firmó,
 *                             cuánto rezago tiene ese mismo trámite.
 *
 * El puente es `programa_nci` (ver migración 2026-09-16_programas_sociales.sql):
 * liga cada `nci` de productividad con su programa, vía la línea de captura
 * (satq_lineas_captura.dsnci). Se excluye 'Regular' — no es un programa
 * social, es todo lo que no tiene programa asignado en el catálogo (eso ya lo
 * cubre el reporte de Productividad por Delegación).
 *
 * Semántica de fecha, igual que en Productividad, más una tercera para dinero:
 *   - Ingresados:  `fecha_ingreso` (cuándo entró a oficialía).
 *   - Pendiente:   `productividad_bandeja` es una FOTO al corte de la carga —
 *                  nunca se filtra por periodo.
 *   - Terminados:  `fecha_firma` (cuándo se cerró), no fecha de ingreso.
 *   - Dinero:      `fecha_contable` (fecha del banco/SATQ) — independiente de
 *                  cuándo entró o se firmó el trámite en RPP; puede ir
 *                  adelantada o atrasada respecto a esas dos.
 *
 * El filtro `categoria` (certificación/inscripción) aplica solo al lado RPP:
 * el catálogo de conceptos de SATQ clasifica por tipo de acto administrativo
 * (ej. "Otorgamiento de crédito hipotecario"), no por certificación/inscripción
 * — no hay de dónde derivarlo del lado del dinero sin otro cruce, así que
 * `recaudado`/`subsidio`/dinero NO se acotan por `categoria`.
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET /programas-sociales/catalogo → catálogo de programas para el selector
 *  GET /programas-sociales/resumen  → KPIs por programa (RPP + dinero)
 *  GET /programas-sociales/bandeja  → serie mensual + etapa/tipo/origen de lo pendiente
 *  GET /programas-sociales/terminados → serie mensual + estatus/origen/tipo de lo trabajado
 *  GET /programas-sociales/dinero   → conciliación del dinero con RPP, por estatus
 *  GET /programas-sociales/rezago   → antigüedad del pendiente + avance de rezago
 *  GET /programas-sociales/detalle  → fila por fila (la "lupa"), paginado
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import {
  ResumenProgramasSociales, ProgramaResumenFila, ProgramaCatalogoFila,
  BandejaProgramaResumen, TerminadosProgramaResumen, DineroProgramaResumen,
  SerieMensualFila, DistribucionFila, ProgramasDetalleResponse, RezagoProgramaResumen,
} from './programas-sociales.types';

// Mismos códigos que Productividad por Delegación — ver esa nota para el detalle
// de validación contra tipo_solicitud.
const CODIGOS_CERTIFICACION = ['BI53', 'BI54', 'BI63', 'BI65', 'BI66', 'PM14', 'PM15', 'PM16', 'PM17'];

function casoCategoria(columnaActo: string, combinado: boolean): string {
  const codigo = combinado ? `split_part(${columnaActo}, ' ', 1)` : columnaActo;
  const lista = CODIGOS_CERTIFICACION.map((c) => `'${c}'`).join(',');
  return `CASE WHEN ${codigo} IN (${lista}) THEN 'certificacion' ELSE 'inscripcion' END`;
}

const BUCKET_ETIQUETA: Record<string, string> = {
  '0-3': '0-3 meses', '3-6': '3-6 meses', '6-12': '6-12 meses', 'mas-1-anio': 'Más de 1 año',
};
const BUCKET_SQL: Record<string, string> = {
  '0-3':        `fecha_ingreso >= now() - interval '3 months'`,
  '3-6':        `fecha_ingreso < now() - interval '3 months' AND fecha_ingreso >= now() - interval '6 months'`,
  '6-12':       `fecha_ingreso < now() - interval '6 months' AND fecha_ingreso >= now() - interval '1 year'`,
  'mas-1-anio': `fecha_ingreso < now() - interval '1 year'`,
};
const BUCKET_CASE_SQL = `
  CASE
    WHEN ${BUCKET_SQL['0-3']}  THEN '${BUCKET_ETIQUETA['0-3']}'
    WHEN ${BUCKET_SQL['3-6']}  THEN '${BUCKET_ETIQUETA['3-6']}'
    WHEN ${BUCKET_SQL['6-12']} THEN '${BUCKET_ETIQUETA['6-12']}'
    ELSE '${BUCKET_ETIQUETA['mas-1-anio']}'
  END
`;

// Mismo módulo que el resto de Reportes (Conciliación de Ingresos, FRE, Actos,
// Productividad por Delegación) — otra tarjeta dentro de "Módulo de Reportes".
async function requireModuloReportes(req: Request): Promise<void> {
  const user = req.user as any;
  if (user?.rol === 'SUPERADMIN') return;

  const row = await db('usuario_modulos as um')
    .join('modulos as m', 'm.id', 'um.modulo_id')
    .where('um.usuario_id', user?.id)
    .andWhere('m.clave', 'reportes_satq')
    .andWhere('m.activo', true)
    .first();

  if (!row) throw new AppError('Acceso restringido: "Módulo de Reportes" no habilitado', 403);
}

interface FiltroPrograma { programa?: string; delegacion?: string; desde?: string; hasta?: string; categoria?: 'certificacion' | 'inscripcion' }
function leerFiltro(req: Request): FiltroPrograma {
  const { programa, delegacion, desde, hasta, categoria } = req.query;
  return {
    programa:   programa ? String(programa) : undefined,
    delegacion: delegacion ? String(delegacion) : undefined,
    desde:      desde ? String(desde) : undefined,
    hasta:      hasta ? String(hasta) : undefined,
    categoria:  (categoria === 'certificacion' || categoria === 'inscripcion') ? categoria : undefined,
  };
}

interface ActoConfig { columna: string; combinado: boolean }
const ACTO_INGRESOS:   ActoConfig = { columna: 'acto', combinado: true };
const ACTO_BANDEJA:    ActoConfig = { columna: 'acto', combinado: false };
const ACTO_TERMINADOS: ActoConfig = { columna: 'acto', combinado: true };

// `programa_nci.nci_rpp` (no `nci`) evita ambigüedad de nombre de columna
// contra `productividad_*.nci` en todo lo que sigue — así el resto del SQL
// puede seguir usando `nci`/`delegacion`/`fecha_ingreso` sin prefijo de tabla.
function baseIngresos(f: FiltroPrograma) {
  let q = db('productividad_ingresos').join('programa_nci', 'programa_nci.nci_rpp', 'productividad_ingresos.nci');
  if (f.programa) q = q.andWhere('programa_nci.programa', f.programa);
  return q;
}
function baseBandeja(f: FiltroPrograma) {
  let q = db('productividad_bandeja').join('programa_nci', 'programa_nci.nci_rpp', 'productividad_bandeja.nci');
  if (f.programa) q = q.andWhere('programa_nci.programa', f.programa);
  return q;
}
function baseTerminados(f: FiltroPrograma) {
  let q = db('productividad_terminados').join('programa_nci', 'programa_nci.nci_rpp', 'productividad_terminados.nci');
  if (f.programa) q = q.andWhere('programa_nci.programa', f.programa);
  return q;
}
/** Lado dinero: vw_satq_conciliacion ya trae `programa` y `delegacion` nativos, sin necesidad de programa_nci. */
function baseDinero(f: FiltroPrograma) {
  let q = db('vw_satq_conciliacion').andWhere('programa', '<>', 'Regular');
  if (f.programa)   q = q.andWhere('programa', f.programa);
  if (f.delegacion) q = q.andWhere('delegacion', f.delegacion);
  return q;
}

function aplicarPeriodo<T extends { andWhere: any; andWhereRaw: any }>(q: T, columna: string, f: FiltroPrograma, acto?: ActoConfig): T {
  if (f.delegacion) q = q.andWhere('delegacion', f.delegacion);
  if (f.desde)      q = q.andWhere(columna, '>=', f.desde);
  if (f.hasta)      q = q.andWhereRaw(`${columna} < (?::date + interval '1 day')`, [f.hasta]);
  if (f.categoria && acto) q = q.andWhereRaw(`${casoCategoria(acto.columna, acto.combinado)} = ?`, [f.categoria]);
  return q;
}
function aplicarDelegacionYCategoria<T extends { andWhere: any; andWhereRaw: any }>(q: T, f: FiltroPrograma, acto: ActoConfig): T {
  if (f.delegacion) q = q.andWhere('delegacion', f.delegacion);
  if (f.categoria)  q = q.andWhereRaw(`${casoCategoria(acto.columna, acto.combinado)} = ?`, [f.categoria]);
  return q;
}

// ── GET /programas-sociales/catalogo ────────────────────────────────────
// Sin filtrar por periodo — es el listado para poblar el selector de programa.
export async function getCatalogo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);

    const tramitesRows = await db('programa_nci').groupBy('programa').select('programa').countDistinct('nci_rpp as tramites');
    const pendientesRows = await db('productividad_bandeja')
      .join('programa_nci', 'programa_nci.nci_rpp', 'productividad_bandeja.nci')
      .groupBy('programa_nci.programa').select('programa_nci.programa as programa').count('* as pendientes');
    const dineroRows = await db('vw_satq_conciliacion')
      .andWhere('programa', '<>', 'Regular')
      .groupBy('programa').select('programa').sum('importe as recaudado');

    const pendientesPorPrograma = new Map(pendientesRows.map((r: any) => [r.programa, Number(r.pendientes)]));
    const recaudadoPorPrograma  = new Map(dineroRows.map((r: any) => [r.programa, Number(r.recaudado)]));

    const data: ProgramaCatalogoFila[] = tramitesRows
      .map((r: any) => ({
        programa:   r.programa,
        tramites:   Number(r.tramites),
        pendientes: pendientesPorPrograma.get(r.programa) ?? 0,
        recaudado:  recaudadoPorPrograma.get(r.programa) ?? 0,
      }))
      .sort((a, b) => b.tramites - a.tramites);

    res.json({ data });
  } catch (err) { next(err); }
}

// ── GET /programas-sociales/resumen ─────────────────────────────────────
export async function getResumen(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);
    const f = leerFiltro(req);

    const ingresosRows = await aplicarPeriodo(baseIngresos(f), 'fecha_ingreso', f, ACTO_INGRESOS)
      .groupBy('programa_nci.programa').select('programa_nci.programa as programa').count('* as cantidad');

    const terminadosRows = await aplicarPeriodo(baseTerminados(f), 'fecha_firma', f, ACTO_TERMINADOS)
      .groupBy('programa_nci.programa')
      .select(
        'programa_nci.programa as programa',
        db.raw('count(*) as terminados'),
        db.raw("count(*) FILTER (WHERE estatus = 'Solicitud firmada') as firmadas"),
        db.raw("count(*) FILTER (WHERE estatus = 'Rechazado') as rechazadas"),
        db.raw('avg(dias_atencion) as dias_atencion_promedio'),
      );

    const bandejaRows = await aplicarDelegacionYCategoria(baseBandeja(f), f, ACTO_BANDEJA)
      .groupBy('programa_nci.programa').select('programa_nci.programa as programa').count('* as pendiente_total');

    let dineroQ = baseDinero(f);
    if (f.desde) dineroQ = dineroQ.andWhere('fecha_contable', '>=', f.desde);
    if (f.hasta) dineroQ = dineroQ.andWhereRaw(`fecha_contable < (?::date + interval '1 day')`, [f.hasta]);
    const dineroRows = await dineroQ
      .groupBy('programa')
      .select(
        'programa',
        db.raw('count(*) as total_lineas'),
        db.raw("count(*) FILTER (WHERE conciliado) as conciliadas"),
        db.raw('sum(importe) as neto'),
        db.raw("sum(importe) FILTER (WHERE es_subsidio) as subsidio_crudo"),
      );

    const programas = Array.from(new Set([
      ...ingresosRows.map((r: any) => r.programa),
      ...terminadosRows.map((r: any) => r.programa),
      ...bandejaRows.map((r: any) => r.programa),
      ...dineroRows.map((r: any) => r.programa),
    ])).sort();

    const ingresosPorPrograma   = new Map(ingresosRows.map((r: any) => [r.programa, Number(r.cantidad)]));
    const terminadosPorPrograma = new Map(terminadosRows.map((r: any) => [r.programa, r]));
    const bandejaPorPrograma    = new Map(bandejaRows.map((r: any) => [r.programa, Number(r.pendiente_total)]));
    const dineroPorPrograma     = new Map(dineroRows.map((r: any) => [r.programa, r]));

    const data: ProgramaResumenFila[] = programas.map((programa) => {
      const t: any = terminadosPorPrograma.get(programa) ?? {};
      const d: any = dineroPorPrograma.get(programa) ?? {};
      const totalLineas = Number(d.total_lineas ?? 0);
      return {
        programa,
        ingresados:              ingresosPorPrograma.get(programa) ?? 0,
        terminados:              Number(t.terminados ?? 0),
        firmadas:                Number(t.firmadas ?? 0),
        rechazadas:              Number(t.rechazadas ?? 0),
        dias_atencion_promedio:  t.dias_atencion_promedio != null ? Math.round(Number(t.dias_atencion_promedio) * 10) / 10 : null,
        pendiente_total:         bandejaPorPrograma.get(programa) ?? 0,
        recaudado:               Number(d.neto ?? 0),
        subsidio:                Math.abs(Number(d.subsidio_crudo ?? 0)),
        pct_conciliado:          totalLineas > 0 ? Math.round((Number(d.conciliadas ?? 0) / totalLineas) * 1000) / 10 : 0,
      };
    });

    const resp: ResumenProgramasSociales = {
      filtros: { programa: f.programa ?? null, delegacion: f.delegacion ?? null, desde: f.desde ?? null, hasta: f.hasta ?? null, categoria: f.categoria ?? null },
      data,
    };
    res.json(resp);
  } catch (err) { next(err); }
}

// ── helpers compartidos por /bandeja y /terminados ────────────────────
async function serieMensual(base: () => any, columnaFecha: string, f: FiltroPrograma, acto: ActoConfig): Promise<SerieMensualFila[]> {
  const rows = await aplicarPeriodo(base(), columnaFecha, f, acto)
    .select(db.raw(`EXTRACT(YEAR FROM ${columnaFecha})::int as anio`), db.raw(`EXTRACT(MONTH FROM ${columnaFecha})::int as mes`))
    .count('* as cantidad')
    .groupByRaw('1, 2')
    .orderByRaw('1, 2');
  return rows.map((r: any) => ({ anio: r.anio, mes: r.mes, cantidad: Number(r.cantidad) }));
}
async function distribucion(base: () => any, columna: string, f: FiltroPrograma, columnaFecha: string, acto: ActoConfig): Promise<DistribucionFila[]> {
  const rows = await aplicarPeriodo(base(), columnaFecha, f, acto)
    .whereNotNull(columna)
    .groupBy(columna)
    .select({ etiqueta: columna })
    .count('* as cantidad')
    .orderBy('cantidad', 'desc');
  return rows.map((r: any) => ({ etiqueta: r.etiqueta, cantidad: Number(r.cantidad) }));
}

// ── GET /programas-sociales/bandeja ─────────────────────────────────────
export async function getBandeja(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);
    const f = leerFiltro(req);

    const [totalRow] = await aplicarDelegacionYCategoria(baseBandeja(f), f, ACTO_BANDEJA).count('* as total');

    const [porMes, porEtapa, porTipo, porOrigen] = await Promise.all([
      serieMensual(() => baseBandeja(f), 'fecha_ingreso', f, ACTO_BANDEJA),
      distribucion(() => baseBandeja(f), 'etapa', f, 'fecha_ingreso', ACTO_BANDEJA),
      distribucion(() => baseBandeja(f), 'des_acto', f, 'fecha_ingreso', ACTO_BANDEJA),
      distribucion(() => baseBandeja(f), 'origen', f, 'fecha_ingreso', ACTO_BANDEJA),
    ]);

    const resp: BandejaProgramaResumen = { total: Number((totalRow as any).total), por_mes: porMes, por_etapa: porEtapa, por_tipo: porTipo, por_origen: porOrigen };
    res.json(resp);
  } catch (err) { next(err); }
}

// ── GET /programas-sociales/terminados ──────────────────────────────────
export async function getTerminados(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);
    const f = leerFiltro(req);

    const [resumenRow] = await aplicarPeriodo(baseTerminados(f), 'fecha_firma', f, ACTO_TERMINADOS)
      .select(db.raw('count(*) as total'), db.raw('avg(dias_atencion) as dias_atencion_promedio'));

    const [porMes, porEstatus, porOrigen, porTipo] = await Promise.all([
      serieMensual(() => baseTerminados(f), 'fecha_firma', f, ACTO_TERMINADOS),
      distribucion(() => baseTerminados(f), 'estatus', f, 'fecha_firma', ACTO_TERMINADOS),
      distribucion(() => baseTerminados(f), 'origen', f, 'fecha_firma', ACTO_TERMINADOS),
      distribucion(() => baseTerminados(f), 'tipo_solicitud', f, 'fecha_firma', ACTO_TERMINADOS),
    ]);

    const resp: TerminadosProgramaResumen = {
      total:                   Number((resumenRow as any).total),
      dias_atencion_promedio:  (resumenRow as any).dias_atencion_promedio != null ? Math.round(Number((resumenRow as any).dias_atencion_promedio) * 10) / 10 : null,
      por_mes: porMes, por_estatus: porEstatus, por_origen: porOrigen, por_tipo_solicitud: porTipo,
    };
    res.json(resp);
  } catch (err) { next(err); }
}

// ── GET /programas-sociales/dinero ──────────────────────────────────────
// Conciliación del dinero con RPP — mismo criterio que /satq/resumen, filtrado
// por programa. `desde`/`hasta` acotan por `fecha_contable`, no por
// fecha_ingreso/fecha_firma del trámite.
export async function getDinero(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);
    const f = leerFiltro(req);

    const base = () => {
      let q = baseDinero(f);
      if (f.desde) q = q.andWhere('fecha_contable', '>=', f.desde);
      if (f.hasta) q = q.andWhereRaw(`fecha_contable < (?::date + interval '1 day')`, [f.hasta]);
      return q;
    };

    const [resumenRow] = await base().select(
      db.raw('count(*) as total_lineas'),
      db.raw("count(*) FILTER (WHERE conciliado) as conciliadas"),
      db.raw('sum(importe) as neto'),
      db.raw("sum(importe) FILTER (WHERE es_subsidio) as subsidio_crudo"),
    );

    const porMesRows = await base()
      .select(db.raw(`EXTRACT(YEAR FROM fecha_contable)::int as anio`), db.raw(`EXTRACT(MONTH FROM fecha_contable)::int as mes`))
      .sum('importe as monto')
      .groupByRaw('1, 2').orderByRaw('1, 2');

    const porEstatusRows = await base()
      .groupBy('estatus_conciliacion')
      .select({ etiqueta: 'estatus_conciliacion' })
      .count('* as cantidad')
      .sum('importe as monto')
      .orderBy('monto', 'desc');

    const totalLineas = Number((resumenRow as any).total_lineas ?? 0);
    const resp: DineroProgramaResumen = {
      total_lineas:  totalLineas,
      recaudado:     Number((resumenRow as any).neto ?? 0),
      subsidio:      Math.abs(Number((resumenRow as any).subsidio_crudo ?? 0)),
      pct_conciliado: totalLineas > 0 ? Math.round((Number((resumenRow as any).conciliadas ?? 0) / totalLineas) * 1000) / 10 : 0,
      por_mes:                  porMesRows.map((r: any) => ({ anio: r.anio, mes: r.mes, monto: Number(r.monto) })),
      por_estatus_conciliacion: porEstatusRows.map((r: any) => ({ etiqueta: r.etiqueta, cantidad: Number(r.cantidad), monto: Number(r.monto) })),
    };
    res.json(resp);
  } catch (err) { next(err); }
}

// ── GET /programas-sociales/rezago ──────────────────────────────────────
export async function getRezago(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);
    const f = leerFiltro(req);

    const bucketRows: any[] = await aplicarDelegacionYCategoria(baseBandeja(f), f, ACTO_BANDEJA)
      .select(
        db.raw(`${BUCKET_CASE_SQL} as bucket`),
        db.raw(`${casoCategoria('acto', false)} as categoria`),
        db.raw('count(*) as cantidad'),
      )
      .groupByRaw('1, 2');

    const BUCKET_ORDEN = ['0-3 meses', '3-6 meses', '6-12 meses', 'Más de 1 año'];
    const antiguedad = BUCKET_ORDEN.map((bucket) => {
      const certificacion = Number(bucketRows.find((r: any) => r.bucket === bucket && r.categoria === 'certificacion')?.cantidad ?? 0);
      const inscripcion   = Number(bucketRows.find((r: any) => r.bucket === bucket && r.categoria === 'inscripcion')?.cantidad ?? 0);
      return { bucket, certificacion, inscripcion, total: certificacion + inscripcion };
    });

    const avanceRows: any[] = await aplicarPeriodo(baseTerminados(f), 'fecha_firma', f, ACTO_TERMINADOS)
      .select(
        db.raw(`CASE WHEN date_trunc('month', fecha_ingreso) = date_trunc('month', fecha_firma) THEN 'mismo_mes' ELSE 'rezago' END as tipo`),
        db.raw(`${casoCategoria('acto', true)} as categoria`),
        db.raw('count(*) as cantidad'),
      )
      .groupByRaw('1, 2');

    const sumar = (tipo: string, categoria?: string) =>
      avanceRows.filter((r: any) => r.tipo === tipo && (!categoria || r.categoria === categoria)).reduce((s: number, r: any) => s + Number(r.cantidad), 0);

    const mismoMes = sumar('mismo_mes');
    const deRezago = sumar('rezago');
    const totalAvance = mismoMes + deRezago;

    const resp: RezagoProgramaResumen = {
      antiguedad,
      avance: {
        mismo_mes: mismoMes, de_rezago: deRezago,
        mismo_mes_pct: totalAvance > 0 ? Math.round((mismoMes / totalAvance) * 1000) / 10 : 0,
        de_rezago_pct: totalAvance > 0 ? Math.round((deRezago / totalAvance) * 1000) / 10 : 0,
        mismo_mes_certificacion: sumar('mismo_mes', 'certificacion'),
        mismo_mes_inscripcion:   sumar('mismo_mes', 'inscripcion'),
        de_rezago_certificacion: sumar('rezago', 'certificacion'),
        de_rezago_inscripcion:   sumar('rezago', 'inscripcion'),
      },
    };
    res.json(resp);
  } catch (err) { next(err); }
}

// ── GET /programas-sociales/detalle ─────────────────────────────────────
const DETALLE_FUENTES: Record<string, { columnas: string[] }> = {
  ingresos:   { columnas: ['id', 'nci', 'fecha_ingreso', 'delegacion', 'acto', 'notario', 'no_notaria', 'solicitante', 'folio', 'oficialia', 'asignado_a'] },
  bandeja:    { columnas: ['id', 'nci', 'fecha_ingreso', 'delegacion', 'acto', 'des_acto', 'etapa', 'estatus_solicitud', 'dias_en_bandeja', 'origen', 'notario', 'fre'] },
  terminados: { columnas: ['id', 'nci', 'fecha_ingreso', 'fecha_firma', 'delegacion', 'acto', 'etapa', 'estatus', 'dias_atencion', 'notario', 'solicitante', 'origen'] },
  dinero:     { columnas: ['id', 'referencia', 'no_operacion', 'fecha_contable', 'municipio', 'concepto', 'importe', 'es_subsidio', 'estatus_conciliacion', 'delegacion'] },
};

export async function getDetalle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);

    const fuente = String(req.query.fuente ?? '');
    const cfg = DETALLE_FUENTES[fuente];
    if (!cfg) throw new AppError('Parámetro "fuente" inválido — usa ingresos, bandeja, terminados o dinero', 400);

    const f = leerFiltro(req);
    const page  = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(10000, Math.max(1, Number(req.query.limit) || 20));
    const antiguedad = String(req.query.antiguedad ?? '');
    const rezagoTipo = String(req.query.rezago_tipo ?? '');
    const estatusConciliacion = req.query.estatus_conciliacion ? String(req.query.estatus_conciliacion) : undefined;

    const base = () => {
      if (fuente === 'dinero') {
        let q = baseDinero(f);
        if (f.desde) q = q.andWhere('fecha_contable', '>=', f.desde);
        if (f.hasta) q = q.andWhereRaw(`fecha_contable < (?::date + interval '1 day')`, [f.hasta]);
        if (estatusConciliacion) q = q.andWhere('estatus_conciliacion', estatusConciliacion);
        return q;
      }
      const baseFn = fuente === 'ingresos' ? baseIngresos : fuente === 'bandeja' ? baseBandeja : baseTerminados;
      const acto   = fuente === 'ingresos' ? ACTO_INGRESOS : fuente === 'bandeja' ? ACTO_BANDEJA : ACTO_TERMINADOS;
      let q = fuente === 'bandeja'
        ? aplicarDelegacionYCategoria(baseFn(f), f, acto)
        : aplicarPeriodo(baseFn(f), fuente === 'terminados' ? 'fecha_firma' : 'fecha_ingreso', f, acto);
      if (fuente === 'bandeja' && BUCKET_SQL[antiguedad]) q = q.andWhereRaw(BUCKET_SQL[antiguedad]);
      if (fuente === 'terminados' && rezagoTipo === 'mismo_mes') q = q.andWhereRaw(`date_trunc('month', fecha_ingreso) = date_trunc('month', fecha_firma)`);
      if (fuente === 'terminados' && rezagoTipo === 'rezago')    q = q.andWhereRaw(`date_trunc('month', fecha_ingreso) <> date_trunc('month', fecha_firma)`);
      return q;
    };

    const columnaOrden = fuente === 'dinero' ? 'fecha_contable' : fuente === 'terminados' ? 'fecha_firma' : 'fecha_ingreso';

    const [{ total }] = await base().count('* as total');
    const filas = await base().select(cfg.columnas).orderBy(columnaOrden, 'desc').offset((page - 1) * limit).limit(limit);

    const resp: ProgramasDetalleResponse = { data: filas, meta: { total: Number(total), page, limit } };
    res.json(resp);
  } catch (err) { next(err); }
}
