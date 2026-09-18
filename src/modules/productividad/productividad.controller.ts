/**
 * Controller: Productividad por Delegación (RPPC)
 * File: src/modules/productividad/productividad.controller.ts
 *
 * Fuente: `productividad_ingresos` / `productividad_bandeja` /
 * `productividad_terminados`, cargadas desde las mismas vistas que ya
 * alimentan Superset (reporte_oficialia_general, mv_bandejas,
 * reporte_ac_terminados_general — ver db/VISTAS_SUPERSET/EXCEL_SUPERSET.xlsx
 * y la migración 2026-09-16_productividad_delegaciones.sql). Hoy es una carga
 * manual (TRUNCATE + reload); más adelante puede venir de la API de SIQROO
 * ya contemplada en `integracion_siqroo_config` sin cambiar este contrato.
 *
 * Tres universos, cada uno con su propia semántica de fecha:
 *   - Ingresados:  cuenta por `fecha_ingreso` (cuándo entró a oficialía).
 *   - Pendiente:   `productividad_bandeja` es una FOTO al corte de la carga —
 *                  "pendiente_total" nunca se filtra por periodo (es "ahora
 *                  mismo"); el desglose de /bandeja sí filtra por
 *                  `fecha_ingreso` para responder "de lo pendiente, cuánto es
 *                  de tal periodo" (antigüedad del rezago).
 *   - Terminados:  cuenta por `fecha_firma` (cuándo se cerró/trabajó), no por
 *                  fecha de ingreso — es lo que responde "cuánto se trabajó
 *                  en este periodo".
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET /productividad/resumen      → KPIs por delegación (ingresa/trabajado/pendiente)
 *  GET /productividad/bandeja      → serie mensual + etapa/tipo/origen de lo pendiente
 *  GET /productividad/terminados   → serie mensual + estatus/origen/tipo de lo trabajado
 *  GET /productividad/delegaciones → catálogo para el filtro
 *  GET /productividad/detalle      → fila por fila (la "lupa" de cada KPI), paginado
 *  GET /productividad/rezago       → antigüedad del pendiente (3/6/12 meses) + avance de rezago del periodo
 *
 * Certificación vs. Inscripción: `productividad_terminados.tipo_solicitud` es
 * el único campo que ya trae esta categoría limpia. Ni `productividad_bandeja`
 * ni `productividad_ingresos` la traen — se deriva del código de acto (BI53,
 * BI54... son certificación; el resto, inscripción), verificado contra
 * tipo_solicitud en terminados: coincide en 151,303 de 151,304 casos del
 * único código ambiguo (BI53) — ver CODIGOS_CERTIFICACION más abajo.
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import {
  ResumenProductividad, ProductividadDelegacionResumen,
  BandejaResumen, TerminadosResumen, ProductividadMensualFila, DistribucionFila,
  ProductividadDetalleResponse, RezagoResumen,
} from './productividad.types';

// Códigos de acto que son "certificación" (expedir un documento sobre algo ya
// inscrito) — todo lo demás es "inscripción" (modifica el registro). Derivado
// del catálogo real de productividad_terminados.tipo_solicitud.
const CODIGOS_CERTIFICACION = ['BI53', 'BI54', 'BI63', 'BI65', 'BI66', 'PM14', 'PM15', 'PM16', 'PM17'];

/** CASE SQL que clasifica una fila en 'certificacion' | 'inscripcion' según su código de acto. */
function casoCategoria(columnaActo: string, combinado: boolean): string {
  // `combinado`: true si la columna trae "CÓDIGO Descripción" junto (ingresos/terminados);
  // false si ya es solo el código (bandeja).
  const codigo = combinado ? `split_part(${columnaActo}, ' ', 1)` : columnaActo;
  const lista = CODIGOS_CERTIFICACION.map((c) => `'${c}'`).join(',');
  return `CASE WHEN ${codigo} IN (${lista}) THEN 'certificacion' ELSE 'inscripcion' END`;
}

/** Buckets de antigüedad de lo pendiente (fecha_ingreso vs. ahora) — usados por /rezago y por /detalle?antiguedad=. */
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

// Mismo módulo que el resto de Reportes (Conciliación de Ingresos, FRE, Actos)
// — otra tarjeta dentro de "Módulo de Reportes", no un módulo aparte en la BD.
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

interface FiltroPeriodo { delegacion?: string; desde?: string; hasta?: string; categoria?: 'certificacion' | 'inscripcion' }
function leerFiltro(req: Request): FiltroPeriodo {
  const { delegacion, desde, hasta, categoria } = req.query;
  return {
    delegacion: delegacion ? String(delegacion) : undefined,
    desde:      desde ? String(desde) : undefined,
    hasta:      hasta ? String(hasta) : undefined,
    categoria:  (categoria === 'certificacion' || categoria === 'inscripcion') ? categoria : undefined,
  };
}

/** Cómo trae cada tabla su columna de acto: combinada "CÓDIGO Descripción" (ingresos/terminados) o solo el código (bandeja). */
interface ActoConfig { columna: string; combinado: boolean }
const ACTO_INGRESOS:   ActoConfig = { columna: 'acto', combinado: true };
const ACTO_BANDEJA:    ActoConfig = { columna: 'acto', combinado: false };
const ACTO_TERMINADOS: ActoConfig = { columna: 'acto', combinado: true };

/** Acota una consulta por [desde, hasta] (fechas, inclusive) y por categoría (certificación/inscripción) si aplica. */
function aplicarPeriodo<T extends { andWhere: any; andWhereRaw: any }>(q: T, columna: string, f: FiltroPeriodo, acto?: ActoConfig): T {
  if (f.delegacion) q = q.andWhere('delegacion', f.delegacion);
  if (f.desde)      q = q.andWhere(columna, '>=', f.desde);
  if (f.hasta)      q = q.andWhereRaw(`${columna} < (?::date + interval '1 day')`, [f.hasta]);
  if (f.categoria && acto) q = q.andWhereRaw(`${casoCategoria(acto.columna, acto.combinado)} = ?`, [f.categoria]);
  return q;
}

/** Igual que aplicarPeriodo pero sin fecha — para "pendiente ahora", que nunca se filtra por periodo. */
function aplicarDelegacionYCategoria<T extends { andWhere: any; andWhereRaw: any }>(q: T, f: FiltroPeriodo, acto: ActoConfig): T {
  if (f.delegacion) q = q.andWhere('delegacion', f.delegacion);
  if (f.categoria)  q = q.andWhereRaw(`${casoCategoria(acto.columna, acto.combinado)} = ?`, [f.categoria]);
  return q;
}

// ── GET /productividad/resumen ──────────────────────────────────────────
export async function getResumen(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);
    const f = leerFiltro(req);

    const ingresosRows = await aplicarPeriodo(db('productividad_ingresos'), 'fecha_ingreso', f, ACTO_INGRESOS)
      .groupBy('delegacion').select('delegacion').count('* as cantidad');

    const terminadosRows = await aplicarPeriodo(db('productividad_terminados'), 'fecha_firma', f, ACTO_TERMINADOS)
      .groupBy('delegacion')
      .select(
        'delegacion',
        db.raw('count(*) as terminados'),
        db.raw("count(*) FILTER (WHERE estatus = 'Solicitud firmada') as firmadas"),
        db.raw("count(*) FILTER (WHERE estatus = 'Rechazado') as rechazadas"),
        db.raw('avg(dias_atencion) as dias_atencion_promedio'),
      );

    const bandejaQ = aplicarDelegacionYCategoria(db('productividad_bandeja'), f, ACTO_BANDEJA);
    const bandejaRows = await bandejaQ.groupBy('delegacion').select('delegacion').count('* as pendiente_total');

    const delegaciones = Array.from(new Set([
      ...ingresosRows.map((r: any) => r.delegacion),
      ...terminadosRows.map((r: any) => r.delegacion),
      ...bandejaRows.map((r: any) => r.delegacion),
    ])).sort();

    const ingresosPorDeleg   = new Map(ingresosRows.map((r: any) => [r.delegacion, Number(r.cantidad)]));
    const terminadosPorDeleg = new Map(terminadosRows.map((r: any) => [r.delegacion, r]));
    const bandejaPorDeleg    = new Map(bandejaRows.map((r: any) => [r.delegacion, Number(r.pendiente_total)]));

    const data: ProductividadDelegacionResumen[] = delegaciones.map((delegacion) => {
      const t: any = terminadosPorDeleg.get(delegacion) ?? {};
      return {
        delegacion,
        ingresados:              ingresosPorDeleg.get(delegacion) ?? 0,
        terminados:              Number(t.terminados ?? 0),
        firmadas:                Number(t.firmadas ?? 0),
        rechazadas:              Number(t.rechazadas ?? 0),
        dias_atencion_promedio:  t.dias_atencion_promedio != null ? Math.round(Number(t.dias_atencion_promedio) * 10) / 10 : null,
        pendiente_total:         bandejaPorDeleg.get(delegacion) ?? 0,
      };
    });

    const resp: ResumenProductividad = {
      filtros: { delegacion: f.delegacion ?? null, desde: f.desde ?? null, hasta: f.hasta ?? null, categoria: f.categoria ?? null },
      data,
    };
    res.json(resp);
  } catch (err) { next(err); }
}

// ── helpers de agregación compartidos por /bandeja y /terminados ─────────
async function serieMensual(tabla: string, columnaFecha: string, f: FiltroPeriodo, acto: ActoConfig): Promise<ProductividadMensualFila[]> {
  const rows = await aplicarPeriodo(db(tabla), columnaFecha, f, acto)
    .select(db.raw(`EXTRACT(YEAR FROM ${columnaFecha})::int as anio`), db.raw(`EXTRACT(MONTH FROM ${columnaFecha})::int as mes`))
    .count('* as cantidad')
    .groupByRaw('1, 2')
    .orderByRaw('1, 2');
  return rows.map((r: any) => ({ anio: r.anio, mes: r.mes, cantidad: Number(r.cantidad) }));
}

async function distribucion(tabla: string, columna: string, f: FiltroPeriodo, columnaFecha: string, acto: ActoConfig): Promise<DistribucionFila[]> {
  const q = aplicarPeriodo(db(tabla), columnaFecha, f, acto)
    .whereNotNull(columna)
    .groupBy(columna)
    .select({ etiqueta: columna })
    .count('* as cantidad')
    .orderBy('cantidad', 'desc');
  const rows = await q;
  return rows.map((r: any) => ({ etiqueta: r.etiqueta, cantidad: Number(r.cantidad) }));
}

// ── GET /productividad/bandeja ──────────────────────────────────────────
// La foto de "pendiente ahora" (total) no se filtra por periodo — el
// desglose sí, para responder "de lo pendiente, cuánto entró en tal fecha".
export async function getBandeja(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);
    const f = leerFiltro(req);

    const [totalRow] = await aplicarDelegacionYCategoria(db('productividad_bandeja'), f, ACTO_BANDEJA)
      .count('* as total');

    const [porMes, porEtapa, porTipo, porOrigen] = await Promise.all([
      serieMensual('productividad_bandeja', 'fecha_ingreso', f, ACTO_BANDEJA),
      distribucion('productividad_bandeja', 'etapa', f, 'fecha_ingreso', ACTO_BANDEJA),
      distribucion('productividad_bandeja', 'des_acto', f, 'fecha_ingreso', ACTO_BANDEJA),
      distribucion('productividad_bandeja', 'origen', f, 'fecha_ingreso', ACTO_BANDEJA),
    ]);

    const resp: BandejaResumen = {
      total:      Number((totalRow as any).total),
      por_mes:    porMes,
      por_etapa:  porEtapa,
      por_tipo:   porTipo,
      por_origen: porOrigen,
    };
    res.json(resp);
  } catch (err) { next(err); }
}

// ── GET /productividad/terminados ───────────────────────────────────────
// Todo (total, serie, desgloses) respeta el periodo por `fecha_firma`: es lo
// que se trabajó/cerró en ese rango, no lo que entró en ese rango.
export async function getTerminados(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);
    const f = leerFiltro(req);

    const [resumenRow] = await aplicarPeriodo(db('productividad_terminados'), 'fecha_firma', f, ACTO_TERMINADOS)
      .select(
        db.raw('count(*) as total'),
        db.raw('avg(dias_atencion) as dias_atencion_promedio'),
      );

    const [porMes, porEstatus, porOrigen, porTipo] = await Promise.all([
      serieMensual('productividad_terminados', 'fecha_firma', f, ACTO_TERMINADOS),
      distribucion('productividad_terminados', 'estatus', f, 'fecha_firma', ACTO_TERMINADOS),
      distribucion('productividad_terminados', 'origen', f, 'fecha_firma', ACTO_TERMINADOS),
      distribucion('productividad_terminados', 'tipo_solicitud', f, 'fecha_firma', ACTO_TERMINADOS),
    ]);

    const resp: TerminadosResumen = {
      total:                   Number((resumenRow as any).total),
      dias_atencion_promedio:  (resumenRow as any).dias_atencion_promedio != null ? Math.round(Number((resumenRow as any).dias_atencion_promedio) * 10) / 10 : null,
      por_mes:                 porMes,
      por_estatus:             porEstatus,
      por_origen:              porOrigen,
      por_tipo_solicitud:      porTipo,
    };
    res.json(resp);
  } catch (err) { next(err); }
}

// ── GET /productividad/delegaciones ─────────────────────────────────────
export async function getDelegaciones(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);
    const rows = await db('productividad_ingresos').distinct('delegacion').orderBy('delegacion', 'asc');
    res.json({ data: rows.map((r: any) => r.delegacion) });
  } catch (err) { next(err); }
}

// ── GET /productividad/detalle ──────────────────────────────────────────
// La "lupa" de cada KPI: la lista de trámites detrás del número. `bandeja` no
// aplica el periodo (mismo criterio que su total en /resumen y /bandeja: es
// "lo pendiente ahora", no "lo pendiente que entró en tal fecha").
const DETALLE_FUENTES: Record<string, { tabla: string; columnaFecha: string; columnas: string[]; filtrarPeriodo: boolean; acto: ActoConfig }> = {
  ingresos: {
    tabla: 'productividad_ingresos', columnaFecha: 'fecha_ingreso', filtrarPeriodo: true, acto: ACTO_INGRESOS,
    columnas: ['id', 'nci', 'fecha_ingreso', 'delegacion', 'acto', 'notario', 'no_notaria', 'solicitante', 'folio', 'oficialia', 'asignado_a'],
  },
  bandeja: {
    tabla: 'productividad_bandeja', columnaFecha: 'fecha_ingreso', filtrarPeriodo: false, acto: ACTO_BANDEJA,
    columnas: ['id', 'nci', 'fecha_ingreso', 'delegacion', 'acto', 'des_acto', 'etapa', 'estatus_solicitud', 'dias_en_bandeja', 'origen', 'notario', 'fre'],
  },
  terminados: {
    tabla: 'productividad_terminados', columnaFecha: 'fecha_firma', filtrarPeriodo: true, acto: ACTO_TERMINADOS,
    columnas: ['id', 'nci', 'fecha_ingreso', 'fecha_firma', 'delegacion', 'acto', 'etapa', 'estatus', 'dias_atencion', 'notario', 'solicitante', 'origen'],
  },
};

export async function getDetalle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);

    const fuente = String(req.query.fuente ?? '');
    const cfg = DETALLE_FUENTES[fuente];
    if (!cfg) throw new AppError('Parámetro "fuente" inválido — usa ingresos, bandeja o terminados', 400);

    const f = leerFiltro(req);
    const page  = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(10000, Math.max(1, Number(req.query.limit) || 20));

    // "antiguedad" (solo bandeja): acota por el mismo bucket que /rezago.
    const antiguedad = String(req.query.antiguedad ?? '');
    // "rezago_tipo" (solo terminados): mismo_mes (entró y se cerró el mismo mes) vs. rezago (venía de antes).
    const rezagoTipo = String(req.query.rezago_tipo ?? '');

    const base = () => {
      let q = cfg.filtrarPeriodo
        ? aplicarPeriodo(db(cfg.tabla), cfg.columnaFecha, f, cfg.acto)
        : aplicarDelegacionYCategoria(db(cfg.tabla), f, cfg.acto);
      if (fuente === 'bandeja' && BUCKET_SQL[antiguedad]) {
        q = q.andWhereRaw(BUCKET_SQL[antiguedad]);
      }
      if (fuente === 'terminados' && rezagoTipo === 'mismo_mes') {
        q = q.andWhereRaw(`date_trunc('month', fecha_ingreso) = date_trunc('month', fecha_firma)`);
      }
      if (fuente === 'terminados' && rezagoTipo === 'rezago') {
        q = q.andWhereRaw(`date_trunc('month', fecha_ingreso) <> date_trunc('month', fecha_firma)`);
      }
      return q;
    };

    const [{ total }] = await base().count('* as total');
    const filas = await base()
      .select(cfg.columnas)
      .orderBy(cfg.columnaFecha, 'desc')
      .offset((page - 1) * limit)
      .limit(limit);

    const resp: ProductividadDetalleResponse = { data: filas, meta: { total: Number(total), page, limit } };
    res.json(resp);
  } catch (err) { next(err); }
}

// ── GET /productividad/rezago ───────────────────────────────────────────
// Responde 2 preguntas de Dirección:
//   1. De lo pendiente AHORA, ¿cuánto lleva 0-3 meses, 3-6, 6-12, o más de un
//      año? — antigüedad del rezago, dividido en certificación/inscripción.
//   2. De lo TERMINADO en el periodo filtrado (por fecha_firma), ¿cuánto era
//      del mismo mes en que entró (flujo normal) vs. de un mes anterior
//      (avance de rezago viejo)?
export async function getRezago(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireModuloReportes(req);
    const f = leerFiltro(req);

    const bucketRows: any[] = await aplicarDelegacionYCategoria(db('productividad_bandeja'), f, ACTO_BANDEJA)
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

    const avanceRows: any[] = await aplicarPeriodo(db('productividad_terminados'), 'fecha_firma', f, ACTO_TERMINADOS)
      .select(
        db.raw(`CASE WHEN date_trunc('month', fecha_ingreso) = date_trunc('month', fecha_firma) THEN 'mismo_mes' ELSE 'rezago' END as tipo`),
        db.raw(`${casoCategoria('acto', true)} as categoria`),
        db.raw('count(*) as cantidad'),
      )
      .groupByRaw('1, 2');

    const sumar = (tipo: string, categoria?: string) =>
      avanceRows
        .filter((r: any) => r.tipo === tipo && (!categoria || r.categoria === categoria))
        .reduce((s: number, r: any) => s + Number(r.cantidad), 0);

    const mismoMes = sumar('mismo_mes');
    const deRezago = sumar('rezago');
    const totalAvance = mismoMes + deRezago;

    const resp: RezagoResumen = {
      antiguedad,
      avance: {
        mismo_mes:                mismoMes,
        de_rezago:                deRezago,
        mismo_mes_pct:            totalAvance > 0 ? Math.round((mismoMes / totalAvance) * 1000) / 10 : 0,
        de_rezago_pct:            totalAvance > 0 ? Math.round((deRezago / totalAvance) * 1000) / 10 : 0,
        mismo_mes_certificacion:  sumar('mismo_mes', 'certificacion'),
        mismo_mes_inscripcion:    sumar('mismo_mes', 'inscripcion'),
        de_rezago_certificacion:  sumar('rezago', 'certificacion'),
        de_rezago_inscripcion:    sumar('rezago', 'inscripcion'),
      },
    };
    res.json(resp);
  } catch (err) { next(err); }
}
