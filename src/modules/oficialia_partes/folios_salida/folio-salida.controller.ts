/**
 * Controller: Folio de salida (Oficialía de Partes)
 * File: src/modules/oficialia_partes/folios_salida/folio-salida.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET    /oficios/:id/folio-salida
 *  POST   /oficios/:id/folio-salida/reservar
 *  POST   /oficios/:id/folio-salida/formalizar
 *  DELETE /oficios/:id/folio-salida
 *  GET    /folios-salida/historial
 *  GET    /folios-salida/:id/historial
 */
import { Request, Response, NextFunction } from 'express';
import { db }        from '../../../db';
import { AppError }  from '../../../utils/AppError';
import { esDeJuridica, puedeAprobarOficio, resolverEncargadoDeOficio } from '../oficios.controller';
import {
  reservarFolioSalida,
  formalizarFolioSalida,
  cancelarFolioSalida,
  consultarFolioSalida,
  listarHistorialFoliosSalida,
  historialDeFolio,
} from './folio-salida.service';
import type { RolFormatoFolio } from './folio-salida.types';

async function oficioOFail(id: number): Promise<{ id: number; dirigido_a_id: number | null }> {
  const oficio = await db('oficios').where({ id }).select('id', 'dirigido_a_id').first();
  if (!oficio) throw new AppError('Oficio no encontrado', 404);
  return oficio;
}

/**
 * ¿Puede este usuario reservar el folio como Analista Jurídico?
 *
 * Misma autorización que ya exige `subirProyecto` para trabajar el oficio: el
 * encargado directo del área, o alguien con una asignación jurídica activa
 * sobre él. Reservar antes de tener el proyecto listo no debe pedir menos que
 * subir el proyecto en sí.
 */
async function puedeReservarComoAnalista(user: any, oficioId: number, dirigidoAId: number | null): Promise<boolean> {
  const encargadoDeEsteOficio = await resolverEncargadoDeOficio(dirigidoAId);
  if (encargadoDeEsteOficio === user.id) return true;
  if (!['JURIDICO', 'OPERATIVO', 'OFICIAL'].includes(user.rol)) return false;
  const asignacion = await db('asignaciones_juridicas')
    .where({ oficio_id: oficioId, abogado_id: user.id })
    .first();
  return !!asignacion;
}

/** Director Jurídico (encargado/titular de la unidad) o SUPERADMIN — confirmado para formalizar y cancelar. */
async function esDirectorJuridicoOSuperadmin(user: any, dirigidoAId: number | null): Promise<boolean> {
  if (user.rol === 'SUPERADMIN') return true;
  return puedeAprobarOficio(user, dirigidoAId);
}

/** Quién puede ver el historial completo (incluye lo migrado de SID): Director Jurídico y/o SUPERADMIN. */
async function puedeVerHistorial(user: any): Promise<boolean> {
  if (user.rol === 'SUPERADMIN') return true;
  return esDeJuridica(user);
}

// ─── GET /oficios/:id/folio-salida ───────────────────────────────────────────

export async function getFolioSalida(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const oficioId = parseInt(req.params.id, 10);
    const oficio = await oficioOFail(oficioId);

    const [folio, puedeReservar, puedeFormalizarOCancelar] = await Promise.all([
      consultarFolioSalida(oficioId),
      puedeReservarComoAnalista(user, oficioId, oficio.dirigido_a_id),
      esDirectorJuridicoOSuperadmin(user, oficio.dirigido_a_id),
    ]);

    res.json({
      data: folio,
      permisos: {
        // Ya hay un folio vivo: no se reserva otro encima, se cancela primero.
        puede_reservar:   !folio && (puedeReservar || puedeFormalizarOCancelar),
        puede_formalizar: puedeFormalizarOCancelar && folio?.estatus !== 'ASIGNADO',
        puede_cancelar:   puedeFormalizarOCancelar && !!folio,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /oficios/:id/folio-salida/reservar ─────────────────────────────────

export async function reservarFolioSalidaHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const oficioId = parseInt(req.params.id, 10);
    const rolFormato = req.body?.rol_formato as RolFormatoFolio;

    if (rolFormato !== 'JURIDICO' && rolFormato !== 'DIRECTOR_JURIDICO') {
      throw new AppError('rol_formato debe ser JURIDICO o DIRECTOR_JURIDICO', 400);
    }

    const oficio = await oficioOFail(oficioId);

    const autorizado = rolFormato === 'DIRECTOR_JURIDICO'
      ? await esDirectorJuridicoOSuperadmin(user, oficio.dirigido_a_id)
      : await puedeReservarComoAnalista(user, oficioId, oficio.dirigido_a_id);

    if (!autorizado) throw new AppError('No estás autorizado para reservar este folio', 403);

    const folio = await reservarFolioSalida(oficioId, rolFormato, { id: user.id, rol: user.rol });
    res.status(201).json({ message: 'Folio reservado correctamente', data: folio });
  } catch (err) {
    next(err);
  }
}

// ─── POST /oficios/:id/folio-salida/formalizar ───────────────────────────────

export async function formalizarFolioSalidaHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const oficioId = parseInt(req.params.id, 10);
    const oficio = await oficioOFail(oficioId);

    if (!(await esDirectorJuridicoOSuperadmin(user, oficio.dirigido_a_id))) {
      throw new AppError('No estás autorizado para formalizar este folio', 403);
    }

    const folio = await formalizarFolioSalida(oficioId, { id: user.id, rol: user.rol });
    res.json({ message: 'Folio formalizado correctamente', data: folio });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /oficios/:id/folio-salida ────────────────────────────────────────

export async function cancelarFolioSalidaHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const oficioId = parseInt(req.params.id, 10);
    const motivo = String(req.body?.motivo ?? '').trim();
    if (!motivo) throw new AppError('El motivo de cancelación es obligatorio', 400);

    const oficio = await oficioOFail(oficioId);
    if (!(await esDirectorJuridicoOSuperadmin(user, oficio.dirigido_a_id))) {
      throw new AppError('No estás autorizado para cancelar este folio', 403);
    }

    await cancelarFolioSalida(oficioId, motivo, { id: user.id, rol: user.rol });
    res.json({ message: 'Folio cancelado correctamente' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /folios-salida/historial ────────────────────────────────────────────

/**
 * Historial completo de folios de salida — vivos y los migrados de SID.
 * Solo Director Jurídico y SUPERADMIN: es donde vive el consecutivo legal
 * completo, entrada obligada para conciliar contra lo que SID emitió.
 */
export async function listarHistorialFoliosSalidaHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (!(await puedeVerHistorial(user))) {
      throw new AppError('No estás autorizado para ver el historial de folios', 403);
    }

    const resultado = await listarHistorialFoliosSalida({
      page:       req.query.page  ? parseInt(String(req.query.page), 10)  : undefined,
      limit:      req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
      search:     req.query.search ? String(req.query.search) : undefined,
      soloLegacy: req.query.solo_legacy === 'true',
    });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

// ─── GET /folios-salida/:id/historial ────────────────────────────────────────

export async function historialDeFolioHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    if (!(await puedeVerHistorial(user))) {
      throw new AppError('No estás autorizado para ver el historial de folios', 403);
    }
    const data = await historialDeFolio(parseInt(req.params.id, 10));
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
