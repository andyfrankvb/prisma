/**
 * Controller: Director — métricas y KPIs
 * File: src/modules/director/director.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET /director/metricas          → KPIs generales
 *  GET /director/carga-abogados    → oficios activos por abogado
 *  GET /director/vencimientos      → oficios próximos a vencer / vencidos
 *  GET /director/tendencia         → oficios registrados por día (últimos 30 días)
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import { moduleRegistry } from '../module-registry/module.registry';

// ── Guard: DIRECTOR, ENCARGADO y SECRETARIA ──────────────────
// Los tres roles necesitan la vista global para el dashboard.
// DIRECTOR  → panel completo de supervisión
// ENCARGADO → supervisa el flujo operativo
// SECRETARIA → consulta estado antes de firmar

const ROLES_DASHBOARD = new Set(['DIRECTOR', 'ENCARGADO', 'SECRETARIA']);

function requireDirector(req: Request): void {
  // Acceso de solo lectura al panel: roles de supervisión, o cualquier usuario
  // de Dirección General (la DG y sus asistentes observadores).
  const esDireccionGeneral = (req.user as any)?.unidad_tipo === 'DIRECCION_GENERAL';
  if (!ROLES_DASHBOARD.has(req.user?.rol ?? '') && !esDireccionGeneral) {
    throw new AppError('Acceso restringido: se requiere rol de supervisión', 403);
  }
}

// ── GET /director/metricas ────────────────────────────────────

export async function getMetricas(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireDirector(req);

    // Conteo por estatus
    const porEstatus: { estatus: string; total: string }[] = await db('oficios')
      .select('estatus')
      .count('id as total')
      .groupBy('estatus');

    // Total general
    const totalGeneral = porEstatus.reduce((acc, r) => acc + Number(r.total), 0);

    // Vencidos (tienen_termino, no finalizados, fecha_vencimiento < hoy)
    const [{ vencidos }] = await db('oficios')
      .whereNotIn('estatus', ['FINALIZADO'])
      .andWhere('tiene_termino', true)
      .andWhereRaw(`fecha_vencimiento::date < CURRENT_DATE`)
      .count('id as vencidos');

    // Vencen en 24h
    const [{ urgentes }] = await db('oficios')
      .whereNotIn('estatus', ['FINALIZADO'])
      .andWhere('tiene_termino', true)
      .andWhereRaw(`fecha_vencimiento::date = CURRENT_DATE + INTERVAL '1 day'`)
      .count('id as urgentes');

    // Finalizados este mes
    const [{ finalizados_mes }] = await db('oficios')
      .where('estatus', 'FINALIZADO')
      .andWhereRaw(`DATE_TRUNC('month', fecha_registro) = DATE_TRUNC('month', CURRENT_DATE)`)
      .count('id as finalizados_mes');

    // Tiempo promedio de resolución (días) — solo oficios FINALIZADOS
    const [{ promedio_dias }] = await db('oficios as o')
      .join('auditoria_estados as a', (join) =>
        join
          .on('a.oficio_id', 'o.id')
          .andOnVal('a.estado_nuevo', 'FINALIZADO'),
      )
      .where('o.estatus', 'FINALIZADO')
      .avg(
        db.raw(`EXTRACT(EPOCH FROM (a.fecha_cambio - o.fecha_registro)) / 86400`),
      )
      .as('promedio_dias');

    const estatusMap: Record<string, number> = {};
    for (const r of porEstatus) {
      estatusMap[r.estatus] = Number(r.total);
    }

    // Avance por delegación/área (según el área del destinatario = "delegacion_nombre"):
    // total y finalizados por unidad, con % de avance (finalizados / total).
    const delegRows = await db('oficios as o')
      .leftJoin('usuarios as dir', 'dir.id', 'o.dirigido_a_id')
      .leftJoin('catalogo_unidades as du', 'du.id', 'dir.unidad_id')
      .whereNotNull('du.nombre')
      .groupBy('du.nombre', 'du.tipo')
      .select('du.nombre as delegacion', 'du.tipo as tipo')
      .count('o.id as total')
      .select(db.raw(`count(o.id) FILTER (WHERE o.estatus = 'FINALIZADO') as finalizados`));

    const por_delegacion = delegRows
      .map((r: any) => {
        const total       = Number(r.total);
        const finalizados = Number(r.finalizados);
        return {
          delegacion:  r.delegacion as string,
          tipo:        r.tipo as string,
          total,
          finalizados,
          pendientes:  total - finalizados,
          pct:         total > 0 ? Math.round((finalizados / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.pct - a.pct);

    // Antigüedad crítica: el oficio NO finalizado más antiguo (por fecha de registro).
    const antRow = await db('oficios as o')
      .leftJoin('usuarios as dir', 'dir.id', 'o.dirigido_a_id')
      .leftJoin('catalogo_unidades as du', 'du.id', 'dir.unidad_id')
      .whereNotIn('o.estatus', ['FINALIZADO'])
      .orderBy('o.fecha_registro', 'asc')
      .select('o.folio', 'o.fecha_registro', 'du.nombre as delegacion')
      .first();
    const antiguedad_critica = antRow
      ? {
          folio:      antRow.folio as string,
          delegacion: (antRow.delegacion as string | null) ?? null,
          dias:       Math.floor((Date.now() - new Date(antRow.fecha_registro).getTime()) / 86400000),
        }
      : null;

    res.json({
      data: {
        total_general:    totalGeneral,
        por_estatus:      estatusMap,
        por_delegacion,
        antiguedad_critica,
        vencidos:         Number(vencidos),
        urgentes_24h:     Number(urgentes),
        finalizados_mes:  Number(finalizados_mes),
        promedio_dias_resolucion: promedio_dias
          ? Math.round(Number(promedio_dias) * 10) / 10
          : null,
      },
    });
  } catch (err) { next(err); }
}

// ── GET /director/carga-abogados ──────────────────────────────

export async function getCargaAbogados(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireDirector(req);

    // Subquery: última asignación por oficio (DISTINCT ON global).
    // Evita contar el mismo oficio para abogados que fueron reasignados.
    const rows = await db
      .with('ultima_asignacion', (qb) =>
        qb
          .distinctOn('oficio_id')
          .select('oficio_id', 'abogado_id')
          .from('asignaciones_juridicas')
          .orderBy([
            { column: 'oficio_id', order: 'asc' },
            { column: 'id',        order: 'desc' },
          ]),
      )
      .from('ultima_asignacion as aj')
      .join('usuarios as u', 'u.id', 'aj.abogado_id')
      .join('oficios as o',  'o.id', 'aj.oficio_id')
      .whereNotIn('o.estatus', ['FINALIZADO'])
      .select('u.id', 'u.nombre', 'u.email', 'o.estatus')
      .orderBy('u.nombre');

    // Agrupar por abogado
    const map = new Map<number, {
      id: number; nombre: string; email: string;
      total: number; por_estatus: Record<string, number>;
    }>();

    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, { id: row.id, nombre: row.nombre, email: row.email, total: 0, por_estatus: {} });
      }
      const entry = map.get(row.id)!;
      entry.total++;
      entry.por_estatus[row.estatus] = (entry.por_estatus[row.estatus] ?? 0) + 1;
    }

    res.json({ data: Array.from(map.values()).sort((a, b) => b.total - a.total) });
  } catch (err) { next(err); }
}

// ── GET /director/vencimientos ────────────────────────────────

export async function getVencimientos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireDirector(req);

    // Vencidos
    const vencidos = await db('oficios as o')
      .leftJoin('asignaciones_juridicas as aj', 'aj.oficio_id', 'o.id')
      .leftJoin('usuarios as u', 'u.id', 'aj.abogado_id')
      .whereNotIn('o.estatus', ['FINALIZADO'])
      .andWhere('o.tiene_termino', true)
      .andWhereRaw(`o.fecha_vencimiento::date < CURRENT_DATE`)
      .select(
        'o.id', 'o.folio', 'o.remitente', 'o.dependencia_origen',
        'o.fecha_vencimiento', 'o.estatus',
        db.raw(`CURRENT_DATE - o.fecha_vencimiento::date AS dias_vencido`),
        'u.nombre as abogado_nombre',
      )
      .orderBy('o.fecha_vencimiento', 'asc')
      .limit(20);

    // Próximos a vencer (≤ 3 días)
    const proximos = await db('oficios as o')
      .leftJoin('asignaciones_juridicas as aj', 'aj.oficio_id', 'o.id')
      .leftJoin('usuarios as u', 'u.id', 'aj.abogado_id')
      .whereNotIn('o.estatus', ['FINALIZADO'])
      .andWhere('o.tiene_termino', true)
      .andWhereRaw(`o.fecha_vencimiento::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'`)
      .select(
        'o.id', 'o.folio', 'o.remitente', 'o.dependencia_origen',
        'o.fecha_vencimiento', 'o.estatus',
        db.raw(`o.fecha_vencimiento::date - CURRENT_DATE AS dias_restantes`),
        'u.nombre as abogado_nombre',
      )
      .orderBy('o.fecha_vencimiento', 'asc')
      .limit(20);

    res.json({ data: { vencidos, proximos } });
  } catch (err) { next(err); }
}

// ── GET /director/tendencia ───────────────────────────────────

export async function getTendencia(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireDirector(req);

    const dias = Math.min(90, parseInt(String(req.query.dias ?? 30), 10));

    // Oficios registrados por día
    const registrados = await db('oficios')
      .whereRaw(`fecha_registro >= CURRENT_DATE - INTERVAL '${dias} days'`)
      .select(db.raw(`DATE(fecha_registro) as fecha`))
      .count('id as total')
      .groupByRaw(`DATE(fecha_registro)`)
      .orderBy('fecha', 'asc');

    // Oficios finalizados por día
    const finalizados = await db('auditoria_estados')
      .where('estado_nuevo', 'FINALIZADO')
      .whereRaw(`fecha_cambio >= CURRENT_DATE - INTERVAL '${dias} days'`)
      .select(db.raw(`DATE(fecha_cambio) as fecha`))
      .count('id as total')
      .groupByRaw(`DATE(fecha_cambio)`)
      .orderBy('fecha', 'asc');

    res.json({
      data: {
        registrados: registrados.map((r: any) => ({
          fecha: r.fecha,
          total: Number(r.total),
        })),
        finalizados: finalizados.map((r: any) => ({
          fecha: r.fecha,
          total: Number(r.total),
        })),
      },
    });
  } catch (err) { next(err); }
}

// ── GET /director/supervision ─────────────────────────────────

export async function getSupervision(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    requireDirector(req);

    // computeAll nunca lanza — errores individuales van en el campo `error`
    // Excluimos el propio tablero de la Dirección General: es el visor de
    // métricas, no un módulo operativo con pendientes/alertas propios.
    const MODULOS_NO_METRICA = ['tablero_direccion'];
    const resumenes = (await moduleRegistry.computeAll())
      .filter((r) => !MODULOS_NO_METRICA.includes(r.clave));

    res.json({ data: resumenes });
  } catch (err) { next(err); }
}
