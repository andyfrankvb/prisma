/**
 * Controller: Carga de Datos (Reportes)
 * File: src/modules/carga-datos/carga-datos.controller.ts
 *
 * Las 3 fuentes que alimentan "Conciliación de Ingresos":
 *  1. Reportes SATQ (Excel, un archivo por ejercicio, una hoja por mes) →
 *     se sube aquí, se hace UPSERT en satq_ingresos por (no_operacion,
 *     id_concepto) — nunca duplica si se vuelve a subir el mismo periodo.
 *  2. Estimación mensual de SEFIPLAN + lo reportado por RPP en su propio
 *     Excel → formulario simple (12 meses), no vale la pena un parser de
 *     archivo para 12 números.
 *  3. Líneas de captura de SIQROO → por ahora sigue siendo manual (ver
 *     satq_lineas_captura), la meta es que la sincronización automática de
 *     src/integraciones/siqroo.sync.ts la reemplace en cuanto SIQROO entregue
 *     su API. Aquí solo se administra la configuración (URL + API key) y el
 *     botón de "sincronizar ahora".
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  POST /carga-datos/satq-ingresos              → subir un reporte SATQ (dry_run o confirmar)
 *  GET  /carga-datos/estimacion                 → estimación SEFIPLAN de un año
 *  PUT  /carga-datos/estimacion                  → guardar la estimación de un año
 *  GET  /carga-datos/integracion-siqroo          → configuración actual (sin exponer la key)
 *  PUT  /carga-datos/integracion-siqroo          → guardar URL / API key / activo
 *  POST /carga-datos/integracion-siqroo/sincronizar → disparar una sincronización manual
 *  GET  /carga-datos/log                         → bitácora de cargas/ediciones/sincronizaciones
 */

import { Request, Response, NextFunction } from 'express';
import { db }        from '../../db';
import { AppError }  from '../../utils/AppError';
import { cifrar }    from '../../utils/crypto';
import { runSiqrooSync } from '../../integraciones/siqroo.sync';
import { ResumenCargaSatq, MesEstimacion, IntegracionSiqrooConfig } from './carga-datos.types';

async function requireModuloCarga(req: Request): Promise<void> {
  const user = req.user as any;
  if (user?.rol === 'SUPERADMIN') return;

  const row = await db('usuario_modulos as um')
    .join('modulos as m', 'm.id', 'um.modulo_id')
    .where('um.usuario_id', user?.id)
    .andWhere('m.clave', 'carga_datos_reportes')
    .andWhere('m.activo', true)
    .first();

  if (!row) throw new AppError('Acceso restringido: "Carga de Datos (Reportes)" no habilitado', 403);
}

// ── POST /carga-datos/satq-ingresos ────────────────────────────

const COLUMNAS_REQUERIDAS = ['referencia', 'nooperacion', 'fechacontable', 'municipio', 'idconcepto', 'concepto', 'importe', 'totalreferencia'];

function normalizarEncabezado(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/[\s_]+/g, '');
}

interface FilaSatqParseada {
  referencia:       string;
  no_operacion:     string;
  fecha_contable:   string;
  municipio:        string;
  id_concepto:      number;
  concepto:         string;
  importe:          number;
  total_referencia: number;
}

async function parsearWorkbookSatq(buffer: Buffer): Promise<{ filas: FilaSatqParseada[]; hojasProcesadas: string[]; hojasOmitidas: string[] }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);

  const filas: FilaSatqParseada[] = [];
  const hojasProcesadas: string[] = [];
  const hojasOmitidas: string[] = [];

  for (const ws of wb.worksheets) {
    const headerRow = ws.getRow(1);
    const colIndex: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      colIndex[normalizarEncabezado(cell.value)] = colNumber;
    });

    const faltantes = COLUMNAS_REQUERIDAS.filter((c) => !colIndex[c]);
    if (faltantes.length > 0) {
      hojasOmitidas.push(ws.name);
      continue;
    }
    hojasProcesadas.push(ws.name);

    const cReferencia = colIndex['referencia'];
    const cNoOperacion = colIndex['nooperacion'];
    const cFecha = colIndex['fechacontable'];
    const cMunicipio = colIndex['municipio'];
    const cIdConcepto = colIndex['idconcepto'];
    const cConcepto = colIndex['concepto'];
    const cImporte = colIndex['importe'];
    const cTotalReferencia = colIndex['totalreferencia'];

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      // Referencia y No. de Operación se leen como TEXTO (cell.text), no
      // como número: son códigos de hasta 17+ dígitos, más allá de los 2^53
      // que un JS number puede representar sin perder precisión. cell.value
      // los convertiría a number y los corrompería silenciosamente.
      const referencia   = row.getCell(cReferencia).text?.trim();
      const noOperacion  = row.getCell(cNoOperacion).text?.trim();
      if (!referencia || !noOperacion) return; // fila vacía / de relleno

      const fechaValue = row.getCell(cFecha).value;
      let fecha: string;
      if (fechaValue instanceof Date) {
        fecha = fechaValue.toISOString().slice(0, 10);
      } else {
        const texto = row.getCell(cFecha).text?.trim() ?? '';
        const parsed = new Date(texto);
        fecha = isNaN(parsed.getTime()) ? texto.slice(0, 10) : parsed.toISOString().slice(0, 10);
      }

      filas.push({
        referencia,
        no_operacion: noOperacion,
        fecha_contable: fecha,
        municipio: String(row.getCell(cMunicipio).value ?? '').trim(),
        id_concepto: Number(row.getCell(cIdConcepto).value),
        concepto: String(row.getCell(cConcepto).value ?? '').trim(),
        importe: Number(row.getCell(cImporte).value),
        total_referencia: Number(row.getCell(cTotalReferencia).value),
      });
    });
  }

  return { filas, hojasProcesadas, hojasOmitidas };
}

export async function postSatqIngresos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloCarga(req);

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw new AppError('Falta el archivo (campo "archivo")', 400);

    const dryRun = String(req.body?.dry_run ?? 'true') !== 'false';

    const { filas, hojasProcesadas, hojasOmitidas } = await parsearWorkbookSatq(file.buffer);
    if (filas.length === 0) {
      throw new AppError('No se encontraron filas válidas en el archivo (revisa que las hojas traigan las columnas esperadas: Referencia, No_Operacion, Fecha_Contable, Municipio, id_Concepto, Concepto, Importe, Total_Referencia)', 400);
    }

    await db('stg_satq_ingresos_carga').truncate();
    const CHUNK = 2000;
    for (let i = 0; i < filas.length; i += CHUNK) {
      await db('stg_satq_ingresos_carga').insert(filas.slice(i, i + CHUNK));
    }

    const [{ filas_nuevas }] = await db('stg_satq_ingresos_carga as s')
      .whereNotExists(
        db('satq_ingresos as i')
          .whereRaw('i.no_operacion = s.no_operacion')
          .andWhereRaw('i.id_concepto = s.id_concepto'),
      )
      .select(db.raw('COUNT(*) as filas_nuevas')) as any[];

    const [{ filas_actualizadas }] = await db('stg_satq_ingresos_carga as s')
      .join('satq_ingresos as i', function () {
        this.on('i.no_operacion', '=', 's.no_operacion').andOn('i.id_concepto', '=', 's.id_concepto');
      })
      .whereRaw(`
        i.importe IS DISTINCT FROM s.importe OR
        i.total_referencia IS DISTINCT FROM s.total_referencia OR
        i.fecha_contable IS DISTINCT FROM s.fecha_contable OR
        i.municipio IS DISTINCT FROM s.municipio OR
        i.concepto IS DISTINCT FROM s.concepto OR
        i.referencia IS DISTINCT FROM s.referencia
      `)
      .select(db.raw('COUNT(*) as filas_actualizadas')) as any[];

    const [{ fecha_desde, fecha_hasta }] = await db('stg_satq_ingresos_carga')
      .select(db.raw('MIN(fecha_contable) as fecha_desde'), db.raw('MAX(fecha_contable) as fecha_hasta')) as any[];

    const filasNuevasNum = Number(filas_nuevas);
    const filasActualizadasNum = Number(filas_actualizadas);

    if (!dryRun) {
      await db.raw(`
        INSERT INTO satq_ingresos (referencia, no_operacion, fecha_contable, municipio, id_concepto, concepto, importe, total_referencia)
        SELECT referencia, no_operacion, fecha_contable, municipio, id_concepto, concepto, importe, total_referencia
          FROM stg_satq_ingresos_carga
        ON CONFLICT (no_operacion, id_concepto) DO UPDATE SET
          referencia        = EXCLUDED.referencia,
          fecha_contable    = EXCLUDED.fecha_contable,
          municipio         = EXCLUDED.municipio,
          concepto          = EXCLUDED.concepto,
          importe           = EXCLUDED.importe,
          total_referencia  = EXCLUDED.total_referencia
      `);

      await db('carga_datos_log').insert({
        tipo: 'satq_ingresos',
        usuario_id: (req.user as any)?.id,
        archivo_nombre: file.originalname,
        filas_nuevas: filasNuevasNum,
        filas_actualizadas: filasActualizadasNum,
        filas_total: filas.length,
        fecha_desde,
        fecha_hasta,
        estado: 'exitoso',
        detalle: `Hojas procesadas: ${hojasProcesadas.join(', ')}${hojasOmitidas.length ? ` · omitidas: ${hojasOmitidas.join(', ')}` : ''}`,
      });

      await db('stg_satq_ingresos_carga').truncate();
    }

    const resumen: ResumenCargaSatq = {
      dry_run: dryRun,
      filas_total: filas.length,
      filas_nuevas: filasNuevasNum,
      filas_actualizadas: filasActualizadasNum,
      filas_sin_cambio: filas.length - filasNuevasNum - filasActualizadasNum,
      fecha_desde,
      fecha_hasta,
      hojas_procesadas: hojasProcesadas,
      hojas_omitidas: hojasOmitidas,
    };

    res.json({ data: resumen });
  } catch (err) {
    if (err instanceof AppError) { next(err); return; }
    try {
      await db('carga_datos_log').insert({
        tipo: 'satq_ingresos',
        usuario_id: (req.user as any)?.id,
        archivo_nombre: (req as any).file?.originalname ?? null,
        estado: 'error',
        detalle: (err as any)?.message ?? 'Error desconocido al procesar el archivo',
      });
    } catch { /* no bloquear el error original por un fallo al loguear */ }
    next(err);
  }
}

// ── GET/PUT /carga-datos/estimacion ────────────────────────────

export async function getEstimacion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloCarga(req);
    const anio = parseInt(String(req.query.anio ?? new Date().getFullYear()), 10);

    const rows = await db('satq_estimacion_mensual').where('anio', anio).orderBy('mes', 'asc') as any[];
    const porMes = new Map(rows.map((r: any) => [r.mes, r]));

    const meses: MesEstimacion[] = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const r = porMes.get(mes);
      return {
        mes,
        estimado: r ? Number(r.estimado) : null,
        reportado_excel: r?.reportado_excel !== undefined && r?.reportado_excel !== null ? Number(r.reportado_excel) : null,
      };
    });

    res.json({ data: { anio, meses } });
  } catch (err) { next(err); }
}

export async function putEstimacion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloCarga(req);
    const { anio, meses } = req.body as { anio: number; meses: MesEstimacion[] };
    if (!anio || !Array.isArray(meses)) throw new AppError('Faltan "anio" y/o "meses"', 400);

    let filasActualizadas = 0;
    const cambios: string[] = [];

    for (const m of meses) {
      if (m.estimado === null || m.estimado === undefined) continue; // mes sin capturar, se deja como está
      const anterior = await db('satq_estimacion_mensual').where({ anio, mes: m.mes }).first();

      await db('satq_estimacion_mensual')
        .insert({ anio, mes: m.mes, estimado: m.estimado, reportado_excel: m.reportado_excel ?? null })
        .onConflict(['anio', 'mes'])
        .merge({ estimado: m.estimado, reportado_excel: m.reportado_excel ?? null });

      filasActualizadas++;
      if (!anterior || Number(anterior.estimado) !== m.estimado) {
        cambios.push(`mes ${m.mes}: estimado ${anterior ? Number(anterior.estimado) : '—'} → ${m.estimado}`);
      }
    }

    await db('carga_datos_log').insert({
      tipo: 'estimacion_sefiplan',
      usuario_id: (req.user as any)?.id,
      filas_actualizadas: filasActualizadas,
      filas_total: meses.length,
      fecha_desde: `${anio}-01-01`,
      fecha_hasta: `${anio}-12-31`,
      estado: 'exitoso',
      detalle: cambios.length > 0 ? cambios.join('; ') : 'Sin cambios en los valores capturados',
    });

    res.json({ data: { anio, meses_guardados: filasActualizadas } });
  } catch (err) { next(err); }
}

// ── GET/PUT /carga-datos/integracion-siqroo ────────────────────

export async function getIntegracionSiqroo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloCarga(req);
    const row = await db('integracion_siqroo_config').where('id', 1).first();

    const config: IntegracionSiqrooConfig = {
      api_base_url: row?.api_base_url ?? null,
      api_key_ultimos4: row?.api_key_ultimos4 ?? null,
      api_key_configurada: !!row?.api_key_cifrada,
      activo: !!row?.activo,
      ultima_sincronizacion: row?.ultima_sincronizacion ?? null,
      ultimo_estado: row?.ultimo_estado ?? null,
      ultimo_detalle: row?.ultimo_detalle ?? null,
    };
    res.json({ data: config });
  } catch (err) { next(err); }
}

export async function putIntegracionSiqroo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloCarga(req);
    const { api_base_url, api_key, activo } = req.body as { api_base_url?: string; api_key?: string; activo?: boolean };

    const update: Record<string, any> = {
      api_base_url: api_base_url ?? null,
      activo: !!activo,
      actualizado_en: db.fn.now(),
      actualizado_por_id: (req.user as any)?.id,
    };

    // La API key solo se toca si mandan una nueva — así guardar otros campos
    // (ej. solo activar/desactivar) no obliga a volver a pegarla cada vez.
    if (api_key && api_key.trim()) {
      update.api_key_cifrada = cifrar(api_key.trim());
      update.api_key_ultimos4 = api_key.trim().slice(-4);
    }

    await db('integracion_siqroo_config').where('id', 1).update(update);
    res.json({ message: 'Configuración guardada' });
  } catch (err) { next(err); }
}

export async function postSincronizarSiqroo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloCarga(req);
    const resultado = await runSiqrooSync((req.user as any)?.id ?? null);
    res.json({ data: resultado });
  } catch (err) { next(err); }
}

// ── GET /carga-datos/log ────────────────────────────────────────

export async function getLog(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await requireModuloCarga(req);
    const page  = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
    const limit = Math.min(200, parseInt(String(req.query.limit ?? 30), 10));
    const offset = (page - 1) * limit;

    let query = db('carga_datos_log as l')
      .leftJoin('usuarios as u', 'u.id', 'l.usuario_id');
    if (req.query.tipo) query = query.andWhere('l.tipo', req.query.tipo as string);

    const [{ count }] = await query.clone().clearSelect().select(db.raw('COUNT(*) as count')) as any[];

    const filas = await query
      .clone()
      .select('l.*', 'u.nombre as usuario_nombre')
      .orderBy('l.creado_en', 'desc')
      .limit(limit)
      .offset(offset);

    res.json({ data: filas, meta: { total: Number(count), page, limit } });
  } catch (err) { next(err); }
}
