/**
 * Controller: SATQ — reportes de ingresos y conciliación con RPP
 * File: src/modules/satq/satq.controller.ts
 *
 * Fuente de datos: `satq_ingresos` (conciliación bancaria/contable de SATQ,
 * ejercicios 2025-2026) y `satq_lineas_captura` (vista histórica interna de
 * RPP/SIQROO, 2024-hoy). Ver vista `vw_satq_conciliacion`.
 *
 * Nota sobre "conciliación": `nolineacaptura` (RPP) se reutiliza a través del
 * tiempo para distintos trámites, así que no es una llave 1-a-1 confiable
 * para atribuir montos del lado RPP a una fila de ingreso puntual. `conciliado`
 * es por tanto una bandera de existencia ("¿esta referencia aparece en el
 * histórico de RPP?"), no una igualación exacta de montos — y desde el
 * volcado con estatus (mvw_reporte_lineas_captura), exige además que el
 * trámite haya llegado a estatus 'Entrega': uno que ya existe en RPP pero
 * sigue "En trámite en RPP" (cualquier etapa previa a Entrega) NO cuenta
 * como conciliado. Ver `estatus_conciliacion` en vw_satq_conciliacion para
 * las 4 categorías (Conciliado / En trámite en RPP / Cancelado en RPP / No
 * ha ingresado a RPP).
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET /satq/resumen           → KPIs agregados por periodo (tablero de Dirección)
 *  GET /satq/detalle           → filas paginadas y filtrables (perfil Administrador)
 *  GET /satq/conceptos         → catálogo de conceptos para el filtro
 *  GET /satq/municipios        → catálogo de municipios para el filtro
 *  GET /satq/delegaciones      → catálogo de delegaciones de RPP para el filtro
 *  GET /satq/comparativo-anual → ingreso/subsidio/trámites por año, sin acotar periodo
 *  GET /satq/diagnostico-conciliacion → % sin match por día y por concepto, dentro del periodo
 *  GET /satq/estimacion-vs-recaudacion → estimación (Ingresos) vs. reportado (RPP) vs. nuestra BD, por mes
 *  GET /satq/proyeccion-anual  → cómo podría cerrar el año, según se recupere o no el decremento acumulado
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import { ResumenSatq, ConceptoResumen, MunicipioResumen, DelegacionResumen, ConciliacionResumen, ComparativoAnioAnterior, DesgloseCategoria, ComparativoAnual, DiagnosticoDia, DiagnosticoConcepto, DiagnosticoConciliacion, EstimacionMes, ProyeccionAnual, EscenarioAnual } from './satq.types';

// ── Guard fase 1 (resumen ejecutivo): mismo criterio que el tablero de Dirección ──

const ROLES_DASHBOARD = new Set(['DIRECTOR', 'ENCARGADO', 'SECRETARIA']);

function requireDirector(req: Request): void {
  const esDireccionGeneral = (req.user as any)?.unidad_tipo === 'DIRECCION_GENERAL';
  if (!ROLES_DASHBOARD.has(req.user?.rol ?? '') && !esDireccionGeneral) {
    throw new AppError('Acceso restringido: se requiere rol de supervisión', 403);
  }
}

// ── Guard fase 2 (detalle): módulo "reportes_satq" asignable por persona ──

async function requireModuloSatq(req: Request): Promise<void> {
  const user = req.user as any;
  if (user?.rol === 'SUPERADMIN') return;

  const row = await db('usuario_modulos as um')
    .join('modulos as m', 'm.id', 'um.modulo_id')
    .where('um.usuario_id', user?.id)
    .andWhere('m.clave', 'reportes_satq')
    .andWhere('m.activo', true)
    .first();

  if (!row) throw new AppError('Acceso restringido: módulo "Reporte de Ingresos" no habilitado', 403);
}

const TOP_CONCEPTOS_LIMIT = 7;
// Quintana Roo tiene 11 municipios, pero varios aportan montos marginales —
// sin este tope la lista de municipios queda mucho más larga que las de
// concepto/delegación al lado y deja espacios en blanco enormes en esas dos.
const TOP_MUNICIPIOS_LIMIT = 6;

// Bajo este % de referencias con match en RPP, el resumen ejecutivo marca alerta.
const ALERTA_CONCILIACION_UMBRAL = 50;

/** Mismo rango de fechas, un año antes — para el comparativo interanual. */
function rangoAnioAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const restar = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  };
  return { desde: restar(desde), hasta: restar(hasta) };
}
/**
 * Neto agrupado por categoría (`programa`, `tipo_acto` o `municipio`) para un
 * rango de fechas — usado con el rango del año anterior para armar el
 * comparativo interanual de cada sección (no solo el KPI agregado).
 */
async function netoPorCategoria(
  columna: 'programa' | 'tipo_acto' | 'municipio',
  desde: string,
  hasta: string,
): Promise<Map<string, number>> {
  const rows = await db('vw_satq_conciliacion')
    .whereBetween('fecha_contable', [desde, hasta])
    .groupBy(columna)
    .select(columna)
    .select(db.raw('SUM(importe) as neto')) as any[];

  const mapa = new Map<string, number>();
  for (const r of rows) mapa.set(r[columna], Number(r.neto));
  return mapa;
}

function pctVariacion(actual: number, anterior: number | undefined): number | null {
  if (anterior === undefined) return null;
  if (anterior === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

function armaConciliacionResumen(
  porCategoria: Map<string, number>,
  montoPorCategoria: Map<string, number>,
  totalRows: number,
): ConciliacionResumen {
  const conciliado      = porCategoria.get('Conciliado') ?? 0;
  const enTramiteRpp     = porCategoria.get('En trámite en RPP') ?? 0;
  const canceladoRpp     = porCategoria.get('Cancelado en RPP') ?? 0;
  const noIngresadoRpp   = porCategoria.get('No ha ingresado a RPP') ?? 0;
  const pct = (n: number) => totalRows > 0 ? Math.round((n / totalRows) * 1000) / 10 : 0;
  return {
    conciliado, en_tramite_rpp: enTramiteRpp, cancelado_rpp: canceladoRpp, no_ingresado_rpp: noIngresadoRpp,
    pct_conciliado: pct(conciliado), pct_en_tramite_rpp: pct(enTramiteRpp),
    pct_cancelado_rpp: pct(canceladoRpp), pct_no_ingresado_rpp: pct(noIngresadoRpp),
    monto_conciliado:      montoPorCategoria.get('Conciliado') ?? 0,
    monto_en_tramite_rpp:   montoPorCategoria.get('En trámite en RPP') ?? 0,
    monto_cancelado_rpp:    montoPorCategoria.get('Cancelado en RPP') ?? 0,
    monto_no_ingresado_rpp: montoPorCategoria.get('No ha ingresado a RPP') ?? 0,
  };
}

const DETALLE_LIMIT_DEFAULT = 20;
// 10,000 para no cortar exportaciones a Excel de categorías grandes (el botón
// "Exportar" pide hasta 5,000 filas) — antes esto topaba en 100 sin avisar.
const DETALLE_LIMIT_MAX     = 10000;

function rangoPeriodo(req: Request): { desde: string; hasta: string } {
  const hoy = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);

  const desde = (req.query.desde as string) || primerDiaMes.toISOString().slice(0, 10);
  const hasta = (req.query.hasta as string) || ultimoDiaMes.toISOString().slice(0, 10);
  return { desde, hasta };
}

/**
 * Desglose bruto/subsidio/neto agrupado por una columna categórica
 * (`programa` o `tipo_acto`) — viene del catálogo `satq_catalogo_conceptos`,
 * expuesto en `vw_satq_conciliacion`. "cargo_bruto" es todo lo que NO es
 * subsidio (no solo lo positivo: incluye alguna reversión/ajuste puntual).
 */
async function desglosePorCategoria(
  baseIngresos: () => ReturnType<typeof db>,
  columna: 'programa' | 'tipo_acto',
  desde: string,
  hasta: string,
): Promise<Omit<DesgloseCategoria, 'neto_anio_anterior' | 'pct_variacion_anio_anterior'>[]> {
  const rows = await baseIngresos()
    .groupBy(columna)
    .select(columna)
    .select(
      db.raw("COALESCE(SUM(importe) FILTER (WHERE NOT es_subsidio), 0) as cargo_bruto"),
      db.raw("COALESCE(SUM(importe) FILTER (WHERE es_subsidio), 0) as subsidio"),
      db.raw('SUM(importe) as neto'),
      db.raw('COUNT(*) as cantidad'),
    )
    .orderBy('cargo_bruto', 'desc') as any[];

  // Trámites RPP (dsnci) del lado del cargo vs. del lado del subsidio, por
  // categoría — mismo criterio de existencia que "conciliado" (ver nota del
  // módulo): no es una igualación 1 a 1, es "¿esta línea de captura aparece
  // en el histórico de RPP?". Un trámite puede contar en ambos lados si tuvo
  // cargo y subsidio en la misma línea de captura.
  const tramitesResult = await db.raw(
    `SELECT c.${columna} AS categoria,
            COUNT(DISTINCT l.dsnci) FILTER (WHERE NOT (c.es_subsidio OR i.importe < 0)) AS tramites_rpp_cargo,
            COUNT(DISTINCT l.dsnci) FILTER (WHERE c.es_subsidio OR i.importe < 0)        AS tramites_rpp_subsidio
       FROM satq_ingresos i
       JOIN satq_catalogo_conceptos c ON c.id_concepto = i.id_concepto
       LEFT JOIN satq_lineas_captura l ON l.nolineacaptura = i.referencia
      WHERE i.fecha_contable BETWEEN ? AND ?
      GROUP BY c.${columna}`,
    [desde, hasta],
  );
  const tramitesPorCategoria = new Map<string, { cargo: number; subsidio: number }>();
  for (const r of tramitesResult.rows as any[]) {
    tramitesPorCategoria.set(r.categoria, {
      cargo:    Number(r.tramites_rpp_cargo),
      subsidio: Number(r.tramites_rpp_subsidio),
    });
  }

  return rows.map((r: any) => {
    const cargoBruto = Number(r.cargo_bruto);
    const subsidio   = Number(r.subsidio);
    const tramites   = tramitesPorCategoria.get(r[columna]) ?? { cargo: 0, subsidio: 0 };
    return {
      categoria:      r[columna],
      cargo_bruto:    cargoBruto,
      subsidio,
      neto:           Number(r.neto),
      pct_subsidiado: cargoBruto > 0 ? Math.round((Math.abs(subsidio) / cargoBruto) * 1000) / 10 : 0,
      cantidad:       Number(r.cantidad),
      tramites_rpp_cargo:    tramites.cargo,
      tramites_rpp_subsidio: tramites.subsidio,
    };
  });
}

// ── GET /satq/resumen ──────────────────────────────────────────

export async function getResumen(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Accesible por rol de supervisión (tablero de Dirección) O por tener el
    // módulo "Reporte de Ingresos" asignado (esa vista también lo consume).
    try {
      requireDirector(req);
    } catch {
      await requireModuloSatq(req);
    }

    const { desde, hasta } = rangoPeriodo(req);

    const baseIngresos = () =>
      db('vw_satq_conciliacion')
        .whereBetween('fecha_contable', [desde, hasta]);

    // Ingreso neto (todas las filas) e ingreso bruto (solo cargos positivos).
    // El "Subsidio" se registra en la fuente como un concepto NEGATIVO que
    // descuenta el cargo original de otro concepto en la misma referencia,
    // así que el % de subsidio tiene sentido sobre el bruto, no sobre el neto.
    const [{ ingreso_total, total_referencias, ingreso_bruto }] = await baseIngresos()
      .select(
        db.raw('COALESCE(SUM(importe), 0) as ingreso_total'),
        db.raw('COUNT(DISTINCT referencia) as total_referencias'),
        db.raw('COALESCE(SUM(importe) FILTER (WHERE importe > 0), 0) as ingreso_bruto'),
      ) as any[];

    // Monto de subsidios — usa es_subsidio (catálogo OR importe negativo, ver
    // vw_satq_conciliacion), no el texto del concepto: hay id_concepto no
    // catalogados como subsidio (ej. "19.28 Fojas del documento") que de
    // todos modos traen renglones puntuales en negativo (descuento real).
    // Se reportan en valor absoluto porque en la fuente son montos negativos.
    const [{ monto_subsidios }] = await baseIngresos()
      .andWhere('es_subsidio', true)
      .select(db.raw('COALESCE(ABS(SUM(importe)), 0) as monto_subsidios')) as any[];

    // % de referencias que aparecen en el histórico de RPP (existencia, no monto),
    // y el monto de las filas SIN match — lo que alimenta la alerta de conciliación.
    const [{ total_rows, conciliados, monto_no_conciliado }] = await baseIngresos()
      .select(
        db.raw('COUNT(*) as total_rows'),
        db.raw('COUNT(*) FILTER (WHERE conciliado) as conciliados'),
        db.raw("COALESCE(SUM(importe) FILTER (WHERE NOT conciliado), 0) as monto_no_conciliado"),
      ) as any[];

    // Desglose de conciliación en 4 categorías (ver estatus_conciliacion en
    // vw_satq_conciliacion): "En trámite en RPP" ya existe en RPP pero no ha
    // llegado a Entrega, así que no cuenta como conciliado en el KPI principal.
    const conciliacionRows = await baseIngresos()
      .groupBy('estatus_conciliacion')
      .select('estatus_conciliacion')
      .select(db.raw('COUNT(*) as cantidad'), db.raw('SUM(importe) as monto'));
    const conciliacionPorCategoria = new Map<string, number>(
      conciliacionRows.map((r: any) => [r.estatus_conciliacion, Number(r.cantidad)]),
    );
    const montoPorCategoria = new Map<string, number>(
      conciliacionRows.map((r: any) => [r.estatus_conciliacion, Number(r.monto)]),
    );

    // Comparativo contra el mismo periodo del año anterior
    const anioAnterior = rangoAnioAnterior(desde, hasta);
    const [{ ingreso_total_anterior }] = await db('vw_satq_conciliacion')
      .whereBetween('fecha_contable', [anioAnterior.desde, anioAnterior.hasta])
      .select(db.raw('COALESCE(SUM(importe), 0) as ingreso_total_anterior')) as any[];

    // Trámites firmados en RPP dentro del periodo (independiente del join,
    // usando la fecha propia de la vista de RPP: fcfirma)
    const [{ tramites_rpp }] = await db('satq_lineas_captura')
      .whereRaw('fcfirma::date BETWEEN ? AND ?', [desde, hasta])
      .select(db.raw('COUNT(DISTINCT dsnci) as tramites_rpp')) as any[];

    // De esos trámites, cuántos tienen alguna línea de captura del lado del
    // subsidio (mismo criterio de existencia que "conciliado" — no 1 a 1).
    const tramitesSubsidiadosResult = await db.raw(
      `SELECT COUNT(DISTINCT l.dsnci) AS tramites_subsidiados
         FROM satq_ingresos i
         JOIN satq_catalogo_conceptos c ON c.id_concepto = i.id_concepto
         JOIN satq_lineas_captura l ON l.nolineacaptura = i.referencia
        WHERE i.fecha_contable BETWEEN ? AND ?
          AND (c.es_subsidio OR i.importe < 0)`,
      [desde, hasta],
    );
    const tramitesSubsidiados = Number(tramitesSubsidiadosResult.rows[0]?.tramites_subsidiados ?? 0);

    // Top conceptos por monto — solo cargos positivos y sin subsidios (que se
    // reportan aparte), para que sea una distribución apta para pastel/donut.
    const conceptosRows = await baseIngresos()
      .andWhere('importe', '>', 0)
      .andWhereRaw(`concepto NOT ILIKE '%subsidio%'`)
      .groupBy('id_concepto', 'concepto')
      .select('id_concepto', 'concepto')
      .select(db.raw('SUM(importe) as monto'), db.raw('COUNT(*) as cantidad'))
      .orderBy('monto', 'desc');

    const topConceptos: ConceptoResumen[] = conceptosRows
      .slice(0, TOP_CONCEPTOS_LIMIT)
      .map((r: any) => ({
        id_concepto: r.id_concepto,
        concepto:    r.concepto,
        monto:       Number(r.monto),
        cantidad:    Number(r.cantidad),
      }));

    if (conceptosRows.length > TOP_CONCEPTOS_LIMIT) {
      const resto = conceptosRows.slice(TOP_CONCEPTOS_LIMIT);
      topConceptos.push({
        id_concepto: null,
        concepto:    'Otros conceptos',
        monto:       resto.reduce((acc: number, r: any) => acc + Number(r.monto), 0),
        cantidad:    resto.reduce((acc: number, r: any) => acc + Number(r.cantidad), 0),
      });
    }

    // Ingreso por municipio
    const municipioRows = await baseIngresos()
      .groupBy('municipio')
      .select('municipio')
      .select(db.raw('SUM(importe) as monto'), db.raw('COUNT(*) as cantidad'))
      .orderBy('monto', 'desc');

    // Ingreso por delegación de RPP — viene del cruce vía referencia, no de
    // SATQ directamente, así que solo se conoce para filas conciliadas o en
    // trámite en RPP; el resto cae en "Sin delegación (no en RPP)".
    const delegacionRows = await baseIngresos()
      .groupBy(db.raw("COALESCE(delegacion, 'Sin delegación (no en RPP)')"))
      .select(db.raw("COALESCE(delegacion, 'Sin delegación (no en RPP)') as delegacion"))
      .select(db.raw('SUM(importe) as monto'), db.raw('COUNT(*) as cantidad'))
      .orderBy('monto', 'desc');
    const porDelegacion: DelegacionResumen[] = delegacionRows.map((r: any) => ({
      delegacion: r.delegacion,
      monto:      Number(r.monto),
      cantidad:   Number(r.cantidad),
    }));

    // Comparativo interanual por categoría — mismo rango, un año antes. Solo
    // el neto (no bruto/subsidio) para mantener la consulta liviana.
    const [netoMunicipioAnterior, netoProgramaAnterior, netoTipoActoAnterior] = await Promise.all([
      netoPorCategoria('municipio',  anioAnterior.desde, anioAnterior.hasta),
      netoPorCategoria('programa',   anioAnterior.desde, anioAnterior.hasta),
      netoPorCategoria('tipo_acto',  anioAnterior.desde, anioAnterior.hasta),
    ]);

    const porMunicipio: MunicipioResumen[] = municipioRows
      .slice(0, TOP_MUNICIPIOS_LIMIT)
      .map((r: any) => {
        const neto     = Number(r.monto);
        const anterior = netoMunicipioAnterior.get(r.municipio);
        return {
          municipio: r.municipio,
          monto:     neto,
          cantidad:  Number(r.cantidad),
          monto_anio_anterior:         anterior ?? null,
          pct_variacion_anio_anterior: pctVariacion(neto, anterior),
        };
      });

    if (municipioRows.length > TOP_MUNICIPIOS_LIMIT) {
      const resto = municipioRows.slice(TOP_MUNICIPIOS_LIMIT);
      const netoResto = resto.reduce((acc: number, r: any) => acc + Number(r.monto), 0);
      const anteriorResto = resto.reduce((acc: number, r: any) => {
        const a = netoMunicipioAnterior.get(r.municipio);
        return a !== undefined ? acc + a : acc;
      }, 0);
      const algunAnterior = resto.some((r: any) => netoMunicipioAnterior.has(r.municipio));
      porMunicipio.push({
        municipio: `Otros municipios (${resto.length})`,
        monto:     netoResto,
        cantidad:  resto.reduce((acc: number, r: any) => acc + Number(r.cantidad), 0),
        monto_anio_anterior:         algunAnterior ? anteriorResto : null,
        pct_variacion_anio_anterior: algunAnterior ? pctVariacion(netoResto, anteriorResto) : null,
      });
    }

    // Ingreso por programa (INFONAVIT/FOVISSSTE, INSUS, AGEPROO, SEDETUS,
    // Vivienda Bienestar, Regular) y por tipo de acto, con bruto/subsidio/neto
    const porPrograma = (await desglosePorCategoria(baseIngresos, 'programa', desde, hasta)).map((d) => ({
      ...d,
      neto_anio_anterior:          netoProgramaAnterior.get(d.categoria) ?? null,
      pct_variacion_anio_anterior: pctVariacion(d.neto, netoProgramaAnterior.get(d.categoria)),
    }));
    const porTipoActo = (await desglosePorCategoria(baseIngresos, 'tipo_acto', desde, hasta)).map((d) => ({
      ...d,
      neto_anio_anterior:          netoTipoActoAnterior.get(d.categoria) ?? null,
      pct_variacion_anio_anterior: pctVariacion(d.neto, netoTipoActoAnterior.get(d.categoria)),
    }));

    const totalRowsNum        = Number(total_rows);
    const ingresoTotalNum     = Number(ingreso_total);
    const ingresoBrutoNum     = Number(ingreso_bruto);
    const montoSubsidiosNum   = Number(monto_subsidios);
    const ingresoAnteriorNum  = Number(ingreso_total_anterior);
    const pctConciliado       = totalRowsNum > 0 ? Math.round((Number(conciliados) / totalRowsNum) * 1000) / 10 : 0;

    const comparativo: ComparativoAnioAnterior = {
      periodo: anioAnterior,
      ingreso_total: ingresoAnteriorNum,
      pct_variacion: ingresoAnteriorNum !== 0
        ? Math.round(((ingresoTotalNum - ingresoAnteriorNum) / Math.abs(ingresoAnteriorNum)) * 1000) / 10
        : null,
    };

    const resumen: ResumenSatq = {
      periodo: { desde, hasta },
      ingreso_total:       ingresoTotalNum,
      ingreso_bruto:       ingresoBrutoNum,
      total_referencias:   Number(total_referencias),
      monto_subsidios:     montoSubsidiosNum,
      pct_subsidios:       ingresoBrutoNum > 0 ? Math.round((montoSubsidiosNum / ingresoBrutoNum) * 1000) / 10 : 0,
      tramites_rpp:        Number(tramites_rpp),
      tramites_subsidiados: tramitesSubsidiados,
      pct_conciliado:      pctConciliado,
      monto_no_conciliado: Number(monto_no_conciliado),
      alerta_conciliacion: totalRowsNum > 0 && pctConciliado < ALERTA_CONCILIACION_UMBRAL,
      conciliacion:        armaConciliacionResumen(conciliacionPorCategoria, montoPorCategoria, totalRowsNum),
      comparativo_anio_anterior: comparativo,
      top_conceptos:       topConceptos,
      por_municipio:       porMunicipio,
      por_delegacion:      porDelegacion,
      por_programa:        porPrograma,
      por_tipo_acto:       porTipoActo,
    };

    res.json({ data: resumen });
  } catch (err) { next(err); }
}

// ── GET /satq/detalle ──────────────────────────────────────────

export async function getDetalle(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloSatq(req);

    const { desde, hasta } = rangoPeriodo(req);

    const page  = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
    const limit = Math.min(DETALLE_LIMIT_MAX, parseInt(String(req.query.limit ?? DETALLE_LIMIT_DEFAULT), 10));
    const offset = (page - 1) * limit;

    let query = db('vw_satq_conciliacion').whereBetween('fecha_contable', [desde, hasta]);

    if (req.query.municipio)   query = query.andWhere('municipio', req.query.municipio as string);
    if (req.query.id_concepto) query = query.andWhere('id_concepto', Number(req.query.id_concepto));
    if (req.query.programa)    query = query.andWhere('programa', req.query.programa as string);
    if (req.query.tipo_acto)   query = query.andWhere('tipo_acto', req.query.tipo_acto as string);
    if (req.query.delegacion)  query = query.andWhere('delegacion', req.query.delegacion as string);
    if (req.query.conciliado === 'true')  query = query.andWhere('conciliado', true);
    if (req.query.conciliado === 'false') query = query.andWhere('conciliado', false);
    if (req.query.subsidio === 'true')  query = query.andWhere('es_subsidio', true);
    if (req.query.subsidio === 'false') query = query.andWhere('es_subsidio', false);
    if (req.query.estatus_conciliacion) query = query.andWhere('estatus_conciliacion', req.query.estatus_conciliacion as string);

    // Total de filas y suma de importe sobre TODO lo filtrado (no solo la
    // página actual) — el reporte siempre debe sumar lo que arrojan los filtros.
    const aggRows = await query.clone().clearSelect()
      .select(
        db.raw('COUNT(*) as count'),
        db.raw('COALESCE(SUM(importe), 0) as suma_importe'),
      ) as any[];
    const total        = Number(aggRows[0]?.count ?? 0);
    const sumaImporte   = Number(aggRows[0]?.suma_importe ?? 0);

    const filas = await query
      .clone()
      .select(
        'id', 'referencia', 'no_operacion', 'fecha_contable', 'municipio',
        'id_concepto', 'concepto', 'importe', 'total_referencia', 'conciliado',
        'programa', 'tipo_acto', 'es_subsidio', 'estatus_conciliacion', 'delegacion',
      )
      .orderBy('fecha_contable', 'desc')
      .limit(limit)
      .offset(offset);

    res.json({ data: filas, meta: { total, page, limit, suma_importe: sumaImporte } });
  } catch (err) { next(err); }
}

// ── GET /satq/conceptos ────────────────────────────────────────
// Catálogo para el filtro. El texto de un mismo id_concepto puede cambiar de
// un ejercicio a otro (ajustes de tarifa); se usa la redacción más reciente.

export async function getConceptos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloSatq(req);

    const rows = await db('satq_ingresos')
      .distinctOn('id_concepto')
      .select('id_concepto', 'concepto')
      .orderBy([
        { column: 'id_concepto',    order: 'asc'  },
        { column: 'fecha_contable', order: 'desc' },
      ]);

    res.json({ data: rows });
  } catch (err) { next(err); }
}

// ── GET /satq/municipios ───────────────────────────────────────

export async function getMunicipios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloSatq(req);

    const rows = await db('satq_ingresos')
      .distinct('municipio')
      .orderBy('municipio', 'asc');

    res.json({ data: rows.map((r: any) => r.municipio) });
  } catch (err) { next(err); }
}

// ── GET /satq/delegaciones ─────────────────────────────────────
// Catálogo para el filtro — las 4 delegaciones de RPP (Benito Juárez,
// Playa del Carmen, Cozumel, Othón P. Blanco), vienen del cruce con RPP.

export async function getDelegaciones(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloSatq(req);

    const rows = await db('satq_lineas_captura_resumen')
      .distinct('delegacion')
      .whereNotNull('delegacion')
      .orderBy('delegacion', 'asc');

    res.json({ data: rows.map((r: any) => r.delegacion) });
  } catch (err) { next(err); }
}

// ── GET /satq/programas ────────────────────────────────────────
// Catálogo para el filtro — sale de satq_catalogo_conceptos, no de un enum
// fijo, para que quede en sincronía si el catálogo se corrige/amplía.

export async function getProgramas(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloSatq(req);

    const rows = await db('satq_catalogo_conceptos')
      .distinct('programa')
      .orderBy('programa', 'asc');

    res.json({ data: rows.map((r: any) => r.programa) });
  } catch (err) { next(err); }
}

// ── GET /satq/tipos-acto ───────────────────────────────────────

export async function getTiposActo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloSatq(req);

    const rows = await db('satq_catalogo_conceptos')
      .distinct('tipo_acto')
      .orderBy('tipo_acto', 'asc');

    res.json({ data: rows.map((r: any) => r.tipo_acto) });
  } catch (err) { next(err); }
}

// ── GET /satq/comparativo-anual ─────────────────────────────────
// A diferencia de /resumen, no acota por periodo: da un renglón por CADA año
// con datos, en cualquiera de las dos fuentes. RPP (trámites) cubre 2024 en
// adelante; SATQ (ingreso/subsidio) solo 2025-2026 por ahora — cuando se
// cargue el histórico 2024 de SATQ, ese año deja de mostrar "sin datos" solo.

export async function getComparativoAnual(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    try {
      requireDirector(req);
    } catch {
      await requireModuloSatq(req);
    }

    const ingresosRows = await db('vw_satq_conciliacion')
      .select(db.raw('EXTRACT(YEAR FROM fecha_contable)::int as anio'))
      .select(
        db.raw("COALESCE(SUM(importe) FILTER (WHERE NOT es_subsidio), 0) as cargo_bruto"),
        db.raw("COALESCE(SUM(importe) FILTER (WHERE es_subsidio), 0) as subsidio"),
        db.raw('SUM(importe) as ingreso_neto'),
        db.raw('MIN(fecha_contable) as desde'),
        db.raw('MAX(fecha_contable) as hasta'),
      )
      .groupByRaw('EXTRACT(YEAR FROM fecha_contable)') as any[];

    const rppRows = await db('satq_lineas_captura')
      .whereNotNull('fcfirma')
      .select(db.raw('EXTRACT(YEAR FROM fcfirma)::int as anio'))
      .select(
        db.raw('COUNT(DISTINCT dsnci) as tramites_rpp'),
        db.raw('MIN(fcfirma) as desde'),
        db.raw('MAX(fcfirma) as hasta'),
      )
      .groupByRaw('EXTRACT(YEAR FROM fcfirma)') as any[];

    const ingresosPorAnio = new Map(ingresosRows.map((r: any) => [Number(r.anio), r]));
    const rppPorAnio      = new Map(rppRows.map((r: any) => [Number(r.anio), r]));

    const anios = Array.from(new Set([...ingresosPorAnio.keys(), ...rppPorAnio.keys()])).sort();

    const fechaISO = (d: any): string => new Date(d).toISOString().slice(0, 10);

    const comparativo: ComparativoAnual[] = anios.map((anio) => {
      const ing = ingresosPorAnio.get(anio);
      const rpp = rppPorAnio.get(anio);
      return {
        anio,
        cargo_bruto:      ing ? Number(ing.cargo_bruto) : null,
        subsidio:         ing ? Number(ing.subsidio)    : null,
        ingreso_neto:     ing ? Number(ing.ingreso_neto) : null,
        tiene_datos_satq: !!ing,
        rango_satq:       ing ? { desde: fechaISO(ing.desde), hasta: fechaISO(ing.hasta) } : null,
        tramites_rpp:     rpp ? Number(rpp.tramites_rpp) : 0,
        rango_rpp:        rpp ? { desde: fechaISO(rpp.desde), hasta: fechaISO(rpp.hasta) } : null,
      };
    });

    res.json({ data: comparativo });
  } catch (err) { next(err); }
}

// ── GET /satq/diagnostico-conciliacion ──────────────────────────
// Para investigar el % sin match del periodo: por día (distingue rezago de
// registro en RPP — sube en los últimos días — de un hueco real y estable) y
// por concepto (encuentra tipos de trámite con tasa de no-match fuera de lo
// normal). Perfil Administrador — mismo alcance que /detalle.

const DIAGNOSTICO_CONCEPTO_LIMIT = 12;
const DIAGNOSTICO_CONCEPTO_MIN_FILAS = 20; // evita que un concepto con 2 filas distorsione el % sin match

export async function getDiagnosticoConciliacion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloSatq(req);

    const { desde, hasta } = rangoPeriodo(req);
    const base = () => db('vw_satq_conciliacion').whereBetween('fecha_contable', [desde, hasta]);

    const diaRows = await base()
      .groupByRaw('fecha_contable::date')
      .select(db.raw('fecha_contable::date as fecha'))
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('COUNT(*) FILTER (WHERE NOT conciliado) as sin_match'),
      )
      .orderBy('fecha', 'asc') as any[];

    const porDia: DiagnosticoDia[] = diaRows.map((r: any) => {
      const total = Number(r.total);
      const sinMatch = Number(r.sin_match);
      return {
        fecha: new Date(r.fecha).toISOString().slice(0, 10),
        total,
        sin_match: sinMatch,
        pct_sin_match: total > 0 ? Math.round((sinMatch / total) * 1000) / 10 : 0,
      };
    });

    const conceptoRows = await base()
      .groupBy('id_concepto', 'concepto')
      .select('id_concepto', 'concepto')
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('COUNT(*) FILTER (WHERE NOT conciliado) as sin_match'),
        db.raw("COALESCE(SUM(importe) FILTER (WHERE NOT conciliado), 0) as monto_sin_match"),
      )
      .havingRaw('COUNT(*) >= ?', [DIAGNOSTICO_CONCEPTO_MIN_FILAS])
      // Mayor impacto en dinero, sin importar el signo (cargo o subsidio) — se repite
      // la expresión completa porque Postgres no siempre resuelve el alias dentro de ABS().
      .orderByRaw("ABS(COALESCE(SUM(importe) FILTER (WHERE NOT conciliado), 0)) DESC")
      .limit(DIAGNOSTICO_CONCEPTO_LIMIT) as any[];

    const porConcepto: DiagnosticoConcepto[] = conceptoRows.map((r: any) => {
      const total = Number(r.total);
      const sinMatch = Number(r.sin_match);
      return {
        id_concepto: r.id_concepto,
        concepto:    r.concepto,
        total,
        sin_match:   sinMatch,
        pct_sin_match:   total > 0 ? Math.round((sinMatch / total) * 1000) / 10 : 0,
        monto_sin_match: Number(r.monto_sin_match),
      };
    });

    const diagnostico: DiagnosticoConciliacion = { periodo: { desde, hasta }, por_dia: porDia, por_concepto: porConcepto };
    res.json({ data: diagnostico });
  } catch (err) { next(err); }
}

// ── GET /satq/estimacion-vs-recaudacion ─────────────────────────
// 12 filas (una por mes) para el año pedido: lo que estimó Ingresos, lo que
// reportó RPP en su Excel, y lo que ya tenemos cargado en satq_ingresos.
// `recaudado_bd` es la cifra "viva" — se recalcula de la BD en cada llamada,
// así que si se carga más SATQ después, este endpoint ya lo refleja solo.

export async function getEstimacionVsRecaudacion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloSatq(req);

    const anio = parseInt(String(req.query.anio ?? new Date().getFullYear()), 10);

    const estimacionRows = await db('satq_estimacion_mensual')
      .where('anio', anio)
      .orderBy('mes', 'asc') as any[];

    if (estimacionRows.length === 0) {
      res.json({ data: [] });
      return;
    }

    const recaudadoRows = await db('satq_ingresos')
      .whereRaw('EXTRACT(YEAR FROM fecha_contable) = ?', [anio])
      .select(db.raw('EXTRACT(MONTH FROM fecha_contable)::int as mes'))
      .select(db.raw('SUM(importe) as neto'))
      .groupByRaw('EXTRACT(MONTH FROM fecha_contable)') as any[];
    const recaudadoPorMes = new Map(recaudadoRows.map((r: any) => [Number(r.mes), Number(r.neto)]));

    // Subsidio por mes — mismo criterio que monto_subsidios en /satq/resumen
    // (es_subsidio, catálogo OR importe negativo). Se usa para armar el "gran
    // total" (recaudado + subsidiado): el trabajo real de RPP, se haya cobrado
    // o no, para separar "cayó la recaudación" de "se subsidió más".
    const subsidiosRows = await db('vw_satq_conciliacion')
      .whereRaw('EXTRACT(YEAR FROM fecha_contable) = ?', [anio])
      .andWhere('es_subsidio', true)
      .select(db.raw('EXTRACT(MONTH FROM fecha_contable)::int as mes'))
      .select(db.raw('ABS(SUM(importe)) as monto'))
      .groupByRaw('EXTRACT(MONTH FROM fecha_contable)') as any[];
    const subsidioPorMes = new Map(subsidiosRows.map((r: any) => [Number(r.mes), Number(r.monto)]));

    const meses: EstimacionMes[] = estimacionRows.map((r: any) => {
      const estimado = Number(r.estimado);
      const reportadoExcel = r.reportado_excel !== null ? Number(r.reportado_excel) : null;
      const recaudadoBd = recaudadoPorMes.get(r.mes) ?? null;
      const montoSubsidios = recaudadoBd !== null ? (subsidioPorMes.get(r.mes) ?? 0) : null;
      const granTotal = recaudadoBd !== null && montoSubsidios !== null ? recaudadoBd + montoSubsidios : null;

      const diferenciaBdEst = recaudadoBd !== null ? recaudadoBd - estimado : null;
      const diferenciaGranTotalEst = granTotal !== null ? granTotal - estimado : null;

      return {
        anio,
        mes: r.mes,
        estimado,
        reportado_excel: reportadoExcel,
        recaudado_bd: recaudadoBd,
        diferencia_bd_vs_estimado: diferenciaBdEst,
        pct_diferencia_bd_vs_estimado: diferenciaBdEst !== null && estimado !== 0
          ? Math.round((diferenciaBdEst / estimado) * 1000) / 10
          : null,
        es_decremento: diferenciaBdEst !== null && diferenciaBdEst < 0,
        diferencia_bd_vs_excel: recaudadoBd !== null && reportadoExcel !== null
          ? recaudadoBd - reportadoExcel
          : null,
        monto_subsidios: montoSubsidios,
        gran_total: granTotal,
        diferencia_gran_total_vs_estimado: diferenciaGranTotalEst,
        pct_diferencia_gran_total_vs_estimado: diferenciaGranTotalEst !== null && estimado !== 0
          ? Math.round((diferenciaGranTotalEst / estimado) * 1000) / 10
          : null,
      };
    });

    res.json({ data: meses });
  } catch (err) { next(err); }
}

// ── GET /satq/proyeccion-anual ───────────────────────────────────
//
// Extrapolación simple y transparente, NO un modelo estadístico: toma el %
// promedio de diferencia (BD vs. estimado) de los meses que ya tenemos y lo
// aplica a la estimación de los meses que faltan, para dar una idea de "si
// sigue así, ¿en cuánto cierra el año?" junto al escenario "si se recupera y
// el resto cumple su meta". El método queda documentado en cada campo de la
// respuesta para que quien lo use sepa exactamente de dónde sale cada número.

function armaEscenario(proyeccionRestante: number, recaudadoAcumulado: number, estimadoTotalAnual: number): EscenarioAnual {
  const totalAnual = recaudadoAcumulado + proyeccionRestante;
  const diferencia = totalAnual - estimadoTotalAnual;
  return {
    proyeccion_restante: proyeccionRestante,
    total_anual: totalAnual,
    diferencia_vs_meta_anual: diferencia,
    pct_vs_meta_anual: estimadoTotalAnual > 0 ? Math.round((diferencia / estimadoTotalAnual) * 1000) / 10 : 0,
  };
}

export async function getProyeccionAnual(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloSatq(req);

    const anio = parseInt(String(req.query.anio ?? new Date().getFullYear()), 10);

    const estimacionRows = await db('satq_estimacion_mensual')
      .where('anio', anio)
      .orderBy('mes', 'asc') as any[];

    if (estimacionRows.length === 0) {
      res.status(404).json({ message: `Sin estimación cargada para ${anio}` });
      return;
    }

    const recaudadoRows = await db('satq_ingresos')
      .whereRaw('EXTRACT(YEAR FROM fecha_contable) = ?', [anio])
      .select(db.raw('EXTRACT(MONTH FROM fecha_contable)::int as mes'))
      .select(db.raw('SUM(importe) as neto'))
      .groupByRaw('EXTRACT(MONTH FROM fecha_contable)') as any[];
    const recaudadoPorMes = new Map(recaudadoRows.map((r: any) => [Number(r.mes), Number(r.neto)]));

    let estimadoTranscurrido = 0;
    let recaudadoAcumulado   = 0;
    let estimadoRestante     = 0;
    let estimadoTotalAnual   = 0;
    let sumaPctVariacion     = 0;
    let mesesConDatos        = 0;

    for (const r of estimacionRows) {
      const estimado = Number(r.estimado);
      estimadoTotalAnual += estimado;
      const recaudado = recaudadoPorMes.get(r.mes);
      if (recaudado !== undefined) {
        mesesConDatos++;
        estimadoTranscurrido += estimado;
        recaudadoAcumulado   += recaudado;
        if (estimado !== 0) sumaPctVariacion += ((recaudado - estimado) / estimado) * 100;
      } else {
        estimadoRestante += estimado;
      }
    }

    const pctVariacionPromedio = mesesConDatos > 0 ? Math.round((sumaPctVariacion / mesesConDatos) * 10) / 10 : 0;
    const mesesRestantes = estimacionRows.length - mesesConDatos;

    const escenarioMeta      = armaEscenario(estimadoRestante, recaudadoAcumulado, estimadoTotalAnual);
    const escenarioTendencia = armaEscenario(
      estimadoRestante * (1 + pctVariacionPromedio / 100),
      recaudadoAcumulado,
      estimadoTotalAnual,
    );

    const montoNecesarioRestoAnio = estimadoTotalAnual - recaudadoAcumulado;

    const proyeccion: ProyeccionAnual = {
      anio,
      meses_con_datos: mesesConDatos,
      meses_restantes: mesesRestantes,
      recaudado_acumulado: recaudadoAcumulado,
      estimado_transcurrido: estimadoTranscurrido,
      deficit_acumulado: recaudadoAcumulado - estimadoTranscurrido,
      pct_variacion_promedio: pctVariacionPromedio,
      estimado_restante: estimadoRestante,
      estimado_total_anual: estimadoTotalAnual,
      escenario_meta: escenarioMeta,
      escenario_tendencia: escenarioTendencia,
      monto_necesario_resto_anio: montoNecesarioRestoAnio,
      pct_necesario_sobre_estimado_restante: estimadoRestante > 0
        ? Math.round(((montoNecesarioRestoAnio - estimadoRestante) / estimadoRestante) * 1000) / 10
        : 0,
    };

    res.json({ data: proyeccion });
  } catch (err) { next(err); }
}
