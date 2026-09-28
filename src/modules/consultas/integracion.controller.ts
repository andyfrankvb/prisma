/**
 * Controller: Integración con la API de Consulta Pública (SID)
 * File: src/modules/consultas/integracion.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET  /consultas/integracion              → estado de la sincronización
 *  PUT  /consultas/integracion              → encender/apagar y cambiar la URL
 *  POST /consultas/integracion/sincronizar  → "Sincronizar ahora"
 *
 * El router ya exige sesión y el módulo "consultas" (ver consultas.routes.ts);
 * cambiar la configuración se restringe además a SUPERADMIN, porque apunta a
 * un sistema externo. Disparar una sincronización manual queda abierto a
 * quien tenga el módulo: es idempotente y no borra nada.
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import { runConsultasSync } from '../../integraciones/consultas.sync';

interface EstadoIntegracionDTO {
  activo:                boolean;
  api_base_url:          string | null;
  ultima_sincronizacion: string | null;
  ultimo_estado:         string | null;
  ultimo_detalle:        string | null;
  /** Búsquedas ya guardadas en PRISMA — para contrastar con el total de SID. */
  total_local:           number;
  /** Id de SID más alto guardado (lo más nuevo que se alcanzó a traer). */
  ultimo_origen_id:      number;
  /** Marca de agua: por debajo de este id el histórico está completo, sin huecos. */
  origen_id_continuo:    number;
}

// ── GET /consultas/integracion ──────────────────────────────────
export async function getIntegracion(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await db('integracion_consultas_config').where('id', 1).first();
    const [{ total, max_origen }] = await db('consulta_publica')
      .select(
        db.raw('COUNT(*)::int as total'),
        db.raw('COALESCE(MAX(origen_id), 0)::int as max_origen'),
      ) as { total: number; max_origen: number }[];

    const estado: EstadoIntegracionDTO = {
      activo:                Boolean(row?.activo),
      api_base_url:          row?.api_base_url ?? null,
      ultima_sincronizacion: row?.ultima_sincronizacion ?? null,
      ultimo_estado:         row?.ultimo_estado ?? null,
      ultimo_detalle:        row?.ultimo_detalle ?? null,
      total_local:           total,
      ultimo_origen_id:      max_origen,
      origen_id_continuo:    Number(row?.origen_id_continuo ?? 0),
    };
    res.json({ data: estado });
  } catch (err) { next(err); }
}

// ── PUT /consultas/integracion ──────────────────────────────────
export async function putIntegracion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as { id?: number; rol?: string } | undefined;
    if (user?.rol !== 'SUPERADMIN') {
      throw new AppError('Acceso restringido: solo administración configura la integración', 403);
    }

    const body = (req.body ?? {}) as { activo?: unknown; api_base_url?: unknown };
    const cambios: { activo?: boolean; api_base_url?: string; actualizado_en: Date; actualizado_por_id?: number } = {
      actualizado_en: new Date(),
    };

    if (body.activo !== undefined) {
      if (typeof body.activo !== 'boolean') throw new AppError('activo debe ser verdadero o falso', 400);
      cambios.activo = body.activo;
    }

    if (body.api_base_url !== undefined) {
      const texto = String(body.api_base_url).trim();
      if (!texto) throw new AppError('api_base_url no puede quedar vacía', 400);
      // Se valida aquí y no al sincronizar: una URL mal escrita debe rebotar al
      // guardarla, no a las 3 de la mañana en el cron.
      try { new URL(texto); } catch { throw new AppError('api_base_url no es una dirección válida', 400); }
      cambios.api_base_url = texto;
    }

    if (user?.id) cambios.actualizado_por_id = user.id;

    await db('integracion_consultas_config').where('id', 1).update(cambios);
    res.json({ message: 'Configuración actualizada.' });
  } catch (err) { next(err); }
}

// ── POST /consultas/integracion/sincronizar ─────────────────────
export async function postSincronizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as { id?: number; rol?: string } | undefined;

    // `paginas` solo se usa para cerrar el rezago histórico: es una corrida
    // larga contra un sistema ajeno, así que queda en manos de administración.
    const paginasCrudo = (req.body ?? {}).paginas as unknown;
    let maxPaginas: number | undefined;
    if (paginasCrudo !== undefined) {
      if (user?.rol !== 'SUPERADMIN') {
        throw new AppError('Acceso restringido: solo administración puede lanzar el relleno histórico', 403);
      }
      const n = Number(paginasCrudo);
      if (!Number.isInteger(n) || n < 1) throw new AppError('paginas debe ser un entero mayor que cero', 400);
      maxPaginas = n;
    }

    const resultado = await runConsultasSync(user?.id ?? null, { maxPaginas });
    // Un fallo de la API externa no es un error de PRISMA: se responde 200 con
    // el detalle para que la pantalla lo muestre tal cual, igual que SIQROO.
    res.json({ data: resultado, message: resultado.detalle });
  } catch (err) { next(err); }
}
