/**
 * Controller: Universo de Actos Registrales (RPPC)
 * File: src/modules/actos/actos.controller.ts
 *
 * Fuente: `actos_rpp`, cargada desde `bd/REPORTES UNIVERSO/*.xlsx` (5,499,192
 * actos: Inmobiliario, Persona Moral, Testamentos, Bien Mueble). Un ACTO no es
 * un folio (ver fre_folios): es cada trámite que le pasa a un folio a lo
 * largo de su vida — un folio puede tener muchos actos, conectados por `fre`.
 *
 * "Acervo registral" (`es_acervo`): actos con año < 2004, confirmado con
 * Dirección como trámites históricos migrados poco a poco al sistema (no
 * datos rotos) — ver el comentario completo en la migración
 * `2026-09-15_actos_rpp.sql`. Se muestran como su propia categoría, no se
 * ocultan; solo se excluyen de la tendencia anual porque su fecha no ubica
 * cuándo ocurrió el acto realmente.
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET /actos/resumen    → KPIs y desgloses ejecutivos (Alta Dirección)
 *  GET /actos/detalle    → filas paginadas, para el detalle fila por fila
 *  GET /actos/catalogo   → catálogo completo de códigos de acto (93) con total, para filtro y tabla ranking
 *  GET /actos/tipos      → catálogo de tipos de trámite para el filtro
 *  GET /actos/oficinas   → catálogo de oficinas registrales para el filtro
 *  GET /actos/estatus    → catálogo de estatus de acto para el filtro
 *
 * Pendiente: cruce con recaudación (SATQ). El acto se paga con un NCI, y el
 * NCI es lo que SATQ registra como `referencia` (ver `nolineacaptura` en
 * satq_lineas_captura, que ya se usa así para conciliar en satq.controller.ts)
 * — NO el folio (`fre`): un folio acumula varios actos a lo largo de su vida,
 * cada uno con su propio NCI. `actos_rpp` (cargada de
 * bd/REPORTES UNIVERSO/*.xlsx) no trae esa columna — solo llsolfrmpre, acto,
 * des_acto, fecha_registro, oficina, fre, estatus_acto — así que hoy no hay
 * manera de amarrar un acto puntual a lo que recaudó. Falta que la fuente
 * (SIQROO) incluya el NCI por acto para poder construir esto correctamente.
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import {
  ResumenActos, TipoTramiteResumen, ActoResumen, OficinaActoResumen,
  EstatusActoResumen, AnioActoResumen, ComparativoAnioActo,
} from './actos.types';

const TOP_ACTOS_LIMIT = 15;

// Mismo módulo que "Conciliación de Ingresos" y FRE — otra tarjeta dentro de
// "Módulo de Reportes", no un módulo aparte en la BD.
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

function aplicarFiltros(req: Request, incluirRangoAnio: boolean) {
  let q = db('actos_rpp');
  const { anio_desde, anio_hasta, mes_desde, mes_hasta, tipo_tramite, acto, oficina, estatus_acto, es_acervo } = req.query;
  if (incluirRangoAnio) {
    if (anio_desde) q = q.andWhere('anio', '>=', Number(anio_desde));
    if (anio_hasta) q = q.andWhere('anio', '<=', Number(anio_hasta));
  }
  // Mes de fecha_registro — fuera del "incluirRangoAnio": a diferencia del rango de
  // año (que el comparativo/tendencia ignoran a propósito para siempre mostrar el
  // año más reciente), si alguien filtra "marzo" espera que el comparativo y los
  // KPIs también sean solo de marzo. Es independiente del año elegido: "mayo a
  // agosto" filtra esos meses en cualquier año, no un rango continuo de fechas.
  if (mes_desde) q = q.andWhereRaw('EXTRACT(MONTH FROM fecha_registro) >= ?', [Number(mes_desde)]);
  if (mes_hasta) q = q.andWhereRaw('EXTRACT(MONTH FROM fecha_registro) <= ?', [Number(mes_hasta)]);
  if (tipo_tramite) q = q.andWhere('tipo_tramite', tipo_tramite as string);
  // "acto" acepta uno o varios códigos separados por coma (filtro de selección múltiple).
  const actos = acto ? String(acto).split(',').map((a) => a.trim()).filter(Boolean) : [];
  if (actos.length === 1) q = q.andWhere('acto', actos[0]);
  else if (actos.length > 1) q = q.whereIn('acto', actos);
  if (oficina)      q = q.andWhere('oficina', oficina as string);
  if (estatus_acto) q = q.andWhere('estatus_acto', estatus_acto as string);
  if (es_acervo === 'true')  q = q.andWhere('es_acervo', true);
  if (es_acervo === 'false') q = q.andWhere('es_acervo', false);
  return q;
}

export async function getResumen(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloReportes(req);

    const anioDesde   = req.query.anio_desde   ? Number(req.query.anio_desde) : null;
    const anioHasta   = req.query.anio_hasta   ? Number(req.query.anio_hasta) : null;
    const mesDesde    = req.query.mes_desde    ? Number(req.query.mes_desde) : null;
    const mesHasta    = req.query.mes_hasta    ? Number(req.query.mes_hasta) : null;
    const tipoTramite = (req.query.tipo_tramite as string) || null;
    const acto        = (req.query.acto as string) || null;
    const oficina     = (req.query.oficina as string) || null;
    const estatusActo = (req.query.estatus_acto as string) || null;

    const baseQuery = () => aplicarFiltros(req, true);
    // Filtro sin rango de años: para KPIs/desgloses que deben verse completos
    // sin importar qué rango de años tenga seleccionado el usuario.
    const filtroSinRango = () => aplicarFiltros(req, false);

    const [{ total_actos }] = await baseQuery()
      .select(db.raw('COUNT(*) as total_actos')) as any[];
    const totalNum = Number(total_actos);

    const [{ actos_acervo }] = await filtroSinRango()
      .andWhere('es_acervo', true)
      .select(db.raw('COUNT(*) as actos_acervo')) as any[];

    // Por tipo de trámite
    const tipoRows = await baseQuery()
      .groupBy('tipo_tramite')
      .select('tipo_tramite')
      .select(db.raw('COUNT(*) as cantidad'))
      .orderBy('cantidad', 'desc') as any[];
    const porTipo: TipoTramiteResumen[] = tipoRows.map((r: any) => ({
      tipo_tramite: r.tipo_tramite,
      cantidad:     Number(r.cantidad),
      pct:          totalNum > 0 ? Math.round((Number(r.cantidad) / totalNum) * 1000) / 10 : 0,
    }));

    // Top actos por volumen (catálogo completo en GET /actos/catalogo)
    const actoRows = await baseQuery()
      .groupBy('acto', 'des_acto')
      .select('acto', 'des_acto')
      .select(db.raw('COUNT(*) as cantidad'))
      .orderBy('cantidad', 'desc')
      .limit(TOP_ACTOS_LIMIT) as any[];
    const topActos: ActoResumen[] = actoRows.map((r: any) => ({
      acto:     r.acto,
      des_acto: r.des_acto,
      cantidad: Number(r.cantidad),
      pct:      totalNum > 0 ? Math.round((Number(r.cantidad) / totalNum) * 1000) / 10 : 0,
    }));

    // Por oficina registral — 24 de 5.5M filas llegan sin oficina en la fuente;
    // se muestran con etiqueta explícita en vez de null, pero no cuentan como
    // una oficina activa más.
    const oficinaRows = await baseQuery()
      .select(db.raw("COALESCE(oficina, 'Sin oficina registrada') as oficina"))
      .groupBy(db.raw("COALESCE(oficina, 'Sin oficina registrada')"))
      .select(db.raw('COUNT(*) as cantidad'))
      .orderBy('cantidad', 'desc') as any[];
    const porOficina: OficinaActoResumen[] = oficinaRows.map((r: any) => ({
      oficina:  r.oficina,
      cantidad: Number(r.cantidad),
      pct:      totalNum > 0 ? Math.round((Number(r.cantidad) / totalNum) * 1000) / 10 : 0,
    }));
    const oficinasActivas = porOficina.filter((o) => o.oficina !== 'Sin oficina registrada').length;

    // Por estatus del acto — 27 filas llegan sin estatus en la fuente.
    const estatusRows = await baseQuery()
      .select(db.raw("COALESCE(estatus_acto, 'Sin estatus registrado') as estatus_acto"))
      .groupBy(db.raw("COALESCE(estatus_acto, 'Sin estatus registrado')"))
      .select(db.raw('COUNT(*) as cantidad'))
      .orderBy('cantidad', 'desc') as any[];
    const porEstatus: EstatusActoResumen[] = estatusRows.map((r: any) => ({
      estatus_acto: r.estatus_acto,
      cantidad:     Number(r.cantidad),
      pct:          totalNum > 0 ? Math.round((Number(r.cantidad) / totalNum) * 1000) / 10 : 0,
    }));

    // Tendencia anual — solo actos reales (no acervo), respeta tipo/acto/oficina/estatus
    // pero no el rango de años, igual que en FRE.
    const tendenciaRows = await filtroSinRango()
      .andWhere('es_acervo', false)
      .whereNotNull('anio')
      .groupBy('anio', 'tipo_tramite')
      .select('anio', 'tipo_tramite')
      .select(db.raw('COUNT(*) as cantidad'))
      .orderBy('anio', 'asc') as any[];
    const tendenciaMap = new Map<number, AnioActoResumen>();
    for (const r of tendenciaRows) {
      const anio = Number(r.anio);
      if (!tendenciaMap.has(anio)) tendenciaMap.set(anio, { anio, cantidad: 0, por_tipo: {} });
      const entry = tendenciaMap.get(anio)!;
      entry.cantidad += Number(r.cantidad);
      entry.por_tipo[r.tipo_tramite] = Number(r.cantidad);
    }
    const tendenciaAnual = Array.from(tendenciaMap.values()).sort((a, b) => a.anio - b.anio);

    // Comparativo: año más reciente disponible (sin rango) vs el inmediato anterior.
    let comparativo: ComparativoAnioActo | null = null;
    const anios = Array.from(tendenciaMap.keys()).sort((a, b) => b - a);
    if (anios.length > 0) {
      const anioReciente = anios[0];
      const cantidadReciente = tendenciaMap.get(anioReciente)!.cantidad;
      const anioAnterior = anioReciente - 1;
      const cantidadAnterior = tendenciaMap.get(anioAnterior)?.cantidad ?? null;
      comparativo = {
        anio: anioReciente,
        cantidad: cantidadReciente,
        anio_anterior: anioAnterior,
        cantidad_anio_anterior: cantidadAnterior,
        pct_variacion: cantidadAnterior !== null && cantidadAnterior !== 0
          ? Math.round(((cantidadReciente - cantidadAnterior) / cantidadAnterior) * 1000) / 10
          : null,
      };
    }

    const resumen: ResumenActos = {
      filtros: { anio_desde: anioDesde, anio_hasta: anioHasta, mes_desde: mesDesde, mes_hasta: mesHasta, tipo_tramite: tipoTramite, acto, oficina, estatus_acto: estatusActo },
      total_actos:  totalNum,
      actos_acervo: Number(actos_acervo),
      pct_acervo:   totalNum > 0 ? Math.round((Number(actos_acervo) / totalNum) * 1000) / 10 : 0,
      oficinas_activas: oficinasActivas,
      comparativo_anio_anterior: comparativo,
      por_tipo:    porTipo,
      top_actos:   topActos,
      por_oficina: porOficina,
      por_estatus: porEstatus,
      tendencia_anual: tendenciaAnual,
    };

    res.json({ data: resumen });
  } catch (err) { next(err); }
}

export async function getCatalogo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloReportes(req);
    const rows = await db('actos_rpp')
      .groupBy('acto', 'des_acto', 'tipo_tramite')
      .select('acto', 'des_acto', 'tipo_tramite')
      .select(db.raw('COUNT(*) as cantidad'))
      .orderBy('cantidad', 'desc') as any[];
    res.json({ data: rows.map((r: any) => ({ acto: r.acto, des_acto: r.des_acto, tipo_tramite: r.tipo_tramite, cantidad: Number(r.cantidad) })) });
  } catch (err) { next(err); }
}

export async function getTipos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloReportes(req);
    const rows = await db('actos_rpp').distinct('tipo_tramite').orderBy('tipo_tramite', 'asc');
    res.json({ data: rows.map((r: any) => r.tipo_tramite) });
  } catch (err) { next(err); }
}

export async function getOficinas(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloReportes(req);
    const rows = await db('actos_rpp').distinct('oficina').orderBy('oficina', 'asc');
    res.json({ data: rows.map((r: any) => r.oficina) });
  } catch (err) { next(err); }
}

export async function getEstatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloReportes(req);
    const rows = await db('actos_rpp').distinct('estatus_acto').whereNotNull('estatus_acto').orderBy('estatus_acto', 'asc');
    res.json({ data: rows.map((r: any) => r.estatus_acto) });
  } catch (err) { next(err); }
}

// ── GET /actos/detalle ────────────────────────────────────────────

const DETALLE_LIMIT_DEFAULT = 20;
const DETALLE_LIMIT_MAX     = 10000;

export async function getDetalle(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloReportes(req);

    const page   = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
    const limit  = Math.min(DETALLE_LIMIT_MAX, parseInt(String(req.query.limit ?? DETALLE_LIMIT_DEFAULT), 10));
    const offset = (page - 1) * limit;

    const query = aplicarFiltros(req, true);

    const [{ count }] = await query.clone().clearSelect()
      .select(db.raw('COUNT(*) as count')) as any[];
    const total = Number(count);

    const filas = await query
      .clone()
      .select('id', 'id_origen', 'acto', 'des_acto', 'tipo_tramite', 'fecha_registro', 'anio', 'es_acervo', 'oficina', 'fre', 'estatus_acto')
      .orderBy('id', 'asc')
      .limit(limit)
      .offset(offset);

    res.json({ data: filas, meta: { total, page, limit } });
  } catch (err) { next(err); }
}
