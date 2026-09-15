/**
 * Controller: FRE — universo de Folios Registrales Electrónicos (SIQROO)
 * File: src/modules/fre/fre.controller.ts
 *
 * Fuente: `fre_folios`, cargada desde "UNIVERSO DE FOLIOS-COMPLETO-SIQROO.xlsx"
 * (979,252 folios: Inmobiliario, Persona Moral, Testamentos, Bien Mueble).
 *
 * Nota sobre `anio`: NO es siempre el año de la fecha cruda de la fuente.
 * Para Testamentos la fecha de creación es un artefacto de carga masiva
 * (miles de filas comparten timestamp), así que su `anio` viene del año
 * embebido en el propio folio en vez de la columna de fecha — ver el
 * comentario de la migración `2026-09-14_fre_folios.sql` para el detalle.
 * Los demás tipos sí usan su fecha real.
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET /fre/resumen    → KPIs y desgloses ejecutivos (Alta Dirección)
 *  GET /fre/detalle    → filas paginadas, para el detalle fila por fila (ej. los folios sin año)
 *  GET /fre/tipos      → catálogo de tipos de folio para el filtro
 *  GET /fre/oficinas   → catálogo de oficinas registrales para el filtro
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import { ResumenFre, TipoFolioResumen, OficinaFolioResumen, AnioFolioResumen, CruceOficinaTipo, ComparativoAnioFolio } from './fre.types';

// Mismo módulo que "Conciliación de Ingresos" — FRE es otra tarjeta dentro
// de "Módulo de Reportes", no un módulo aparte en la BD.
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

function baseQuery(req: Request) {
  let q = db('fre_folios');
  const { anio_desde, anio_hasta, tipo_folio, oficina } = req.query;
  if (anio_desde) q = q.andWhere('anio', '>=', Number(anio_desde));
  if (anio_hasta) q = q.andWhere('anio', '<=', Number(anio_hasta));
  if (tipo_folio) q = q.andWhere('tipo_folio', tipo_folio as string);
  if (oficina)    q = q.andWhere('oficina', oficina as string);
  return q;
}

export async function getResumen(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloReportes(req);

    const anioDesde = req.query.anio_desde ? Number(req.query.anio_desde) : null;
    const anioHasta = req.query.anio_hasta ? Number(req.query.anio_hasta) : null;
    const tipoFolio = (req.query.tipo_folio as string) || null;
    const oficina   = (req.query.oficina as string) || null;

    // Total + folios sin año confiable, dentro del filtro (sin el rango de
    // años, porque "sin año" por definición no tiene año que filtrar).
    const filtroSinRango = () => {
      let q = db('fre_folios');
      if (tipoFolio) q = q.andWhere('tipo_folio', tipoFolio);
      if (oficina)   q = q.andWhere('oficina', oficina);
      return q;
    };
    const [{ folios_sin_anio }] = await filtroSinRango()
      .whereNull('anio')
      .select(db.raw('COUNT(*) as folios_sin_anio')) as any[];

    const [{ total_folios }] = await baseQuery(req)
      .select(db.raw('COUNT(*) as total_folios')) as any[];

    // Por tipo de folio
    const tipoRows = await baseQuery(req)
      .groupBy('tipo_folio')
      .select('tipo_folio')
      .select(db.raw('COUNT(*) as cantidad'))
      .orderBy('cantidad', 'desc') as any[];
    const totalNum = Number(total_folios);
    const porTipo: TipoFolioResumen[] = tipoRows.map((r: any) => ({
      tipo_folio: r.tipo_folio,
      cantidad:   Number(r.cantidad),
      pct:        totalNum > 0 ? Math.round((Number(r.cantidad) / totalNum) * 1000) / 10 : 0,
    }));

    // Por oficina registral
    const oficinaRows = await baseQuery(req)
      .groupBy('oficina')
      .select('oficina')
      .select(db.raw('COUNT(*) as cantidad'))
      .orderBy('cantidad', 'desc') as any[];
    const porOficina: OficinaFolioResumen[] = oficinaRows.map((r: any) => ({
      oficina:  r.oficina,
      cantidad: Number(r.cantidad),
      pct:      totalNum > 0 ? Math.round((Number(r.cantidad) / totalNum) * 1000) / 10 : 0,
    }));

    // Tendencia anual (respeta tipo_folio/oficina, pero no el rango de años —
    // la gráfica necesita toda la serie para tener contexto histórico).
    const tendenciaRows = await filtroSinRango()
      .whereNotNull('anio')
      .groupBy('anio', 'tipo_folio')
      .select('anio', 'tipo_folio')
      .select(db.raw('COUNT(*) as cantidad'))
      .orderBy('anio', 'asc') as any[];
    const tendenciaMap = new Map<number, AnioFolioResumen>();
    for (const r of tendenciaRows) {
      const anio = Number(r.anio);
      if (!tendenciaMap.has(anio)) tendenciaMap.set(anio, { anio, cantidad: 0, por_tipo: {} });
      const entry = tendenciaMap.get(anio)!;
      entry.cantidad += Number(r.cantidad);
      entry.por_tipo[r.tipo_folio] = Number(r.cantidad);
    }
    const tendenciaAnual = Array.from(tendenciaMap.values()).sort((a, b) => a.anio - b.anio);

    // Cruce oficina x tipo (respeta todos los filtros incl. rango de años)
    const cruceRows = await baseQuery(req)
      .groupBy('oficina', 'tipo_folio')
      .select('oficina', 'tipo_folio')
      .select(db.raw('COUNT(*) as cantidad')) as any[];
    const cruceOficinaTipo: CruceOficinaTipo[] = cruceRows.map((r: any) => ({
      oficina:    r.oficina,
      tipo_folio: r.tipo_folio,
      cantidad:   Number(r.cantidad),
    }));

    // Comparativo: año más reciente disponible (respetando tipo/oficina, NO
    // el rango de años) vs el año inmediato anterior — así el KPI de "cómo
    // va el año" no depende de qué rango tenga seleccionado el usuario.
    let comparativo: ComparativoAnioFolio | null = null;
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

    const resumen: ResumenFre = {
      filtros: { anio_desde: anioDesde, anio_hasta: anioHasta, tipo_folio: tipoFolio, oficina },
      total_folios: totalNum,
      folios_sin_anio: Number(folios_sin_anio),
      oficinas_activas: porOficina.length,
      comparativo_anio_anterior: comparativo,
      por_tipo: porTipo,
      por_oficina: porOficina,
      tendencia_anual: tendenciaAnual,
      cruce_oficina_tipo: cruceOficinaTipo,
    };

    res.json({ data: resumen });
  } catch (err) { next(err); }
}

export async function getTipos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloReportes(req);
    const rows = await db('fre_folios').distinct('tipo_folio').orderBy('tipo_folio', 'asc');
    res.json({ data: rows.map((r: any) => r.tipo_folio) });
  } catch (err) { next(err); }
}

export async function getOficinas(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloReportes(req);
    const rows = await db('fre_folios').distinct('oficina').orderBy('oficina', 'asc');
    res.json({ data: rows.map((r: any) => r.oficina) });
  } catch (err) { next(err); }
}

// ── GET /fre/detalle ────────────────────────────────────────────

const DETALLE_LIMIT_DEFAULT = 20;
const DETALLE_LIMIT_MAX     = 10000;

export async function getDetalle(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloReportes(req);

    const page  = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
    const limit = Math.min(DETALLE_LIMIT_MAX, parseInt(String(req.query.limit ?? DETALLE_LIMIT_DEFAULT), 10));
    const offset = (page - 1) * limit;

    let query = db('fre_folios');
    const { anio_desde, anio_hasta, tipo_folio, oficina } = req.query;
    if (anio_desde) query = query.andWhere('anio', '>=', Number(anio_desde));
    if (anio_hasta) query = query.andWhere('anio', '<=', Number(anio_hasta));
    if (tipo_folio) query = query.andWhere('tipo_folio', tipo_folio as string);
    if (oficina)    query = query.andWhere('oficina', oficina as string);
    // "sin año" es su propio filtro — no combina con anio_desde/hasta porque
    // por definición un folio sin año no puede caer dentro de ningún rango.
    if (req.query.sin_anio === 'true') query = query.whereNull('anio');

    const [{ count }] = await query.clone().clearSelect()
      .select(db.raw('COUNT(*) as count')) as any[];
    const total = Number(count);

    const filas = await query
      .clone()
      .select('id', 'fre', 'tipo_folio', 'oficina', 'anio', 'fecha', 'razon_social')
      .orderBy('id', 'asc')
      .limit(limit)
      .offset(offset);

    res.json({ data: filas, meta: { total, page, limit } });
  } catch (err) { next(err); }
}
