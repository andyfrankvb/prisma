/**
 * Controller: Notificaciones in-app
 * File: src/modules/notificaciones/notificaciones.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET   /notificaciones          → historial del usuario autenticado
 *  PATCH /notificaciones/:id/read → marcar una como leída
 *  PATCH /notificaciones/read-all → marcar todas como leídas
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';

// ── GET /notificaciones ───────────────────────────────────────

export async function listarNotificaciones(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user   = req.user!;
    const limit  = Math.min(50, parseInt(String(req.query.limit ?? 30), 10));
    const unread = req.query.unread === 'true';

    let query = db('notificaciones')
      .where({ user_id: user.id })
      .orderBy('created_at', 'desc')
      .limit(limit);

    if (unread) query = query.andWhere({ read: false });

    const rows        = await query;
    const unreadCount = await db('notificaciones')
      .where({ user_id: user.id, read: false })
      .count('id as count')
      .first();

    res.json({
      data:         rows,
      unread_count: Number(unreadCount?.count ?? 0),
    });
  } catch (err) { next(err); }
}

// ── PATCH /notificaciones/:id/read ────────────────────────────

export async function marcarLeida(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const id   = parseInt(req.params.id, 10);

    const updated = await db('notificaciones')
      .where({ id, user_id: user.id })
      .update({ read: true });

    if (!updated) throw new AppError('Notificación no encontrada', 404);

    res.json({ message: 'Marcada como leída' });
  } catch (err) { next(err); }
}

// ── PATCH /notificaciones/read-all ────────────────────────────

export async function marcarTodasLeidas(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    await db('notificaciones')
      .where({ user_id: user.id, read: false })
      .update({ read: true });

    res.json({ message: 'Todas marcadas como leídas' });
  } catch (err) { next(err); }
}
