/**
 * Routes: Admin — CRUD de Usuarios
 * File: src/modules/admin/admin.routes.ts
 *
 * Mount in server.ts:
 *   app.use('/api/v1/admin', adminRouter);
 *
 * Todos los endpoints requieren rol SUPERADMIN.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { AppError }     from '../../utils/AppError';
import {
  listarUsuariosAdmin,
  obtenerUsuarioAdmin,
  crearUsuario,
  editarUsuario,
  toggleActivoUsuario,
  resetPassword,
  listarOficinas,
  listarModulos,
  listarModulosUsuario,
  habilitarModulo,
  revocarModulo,
  listarFlujos,
  actualizarFlujo,
  eliminarFlujoUnidad,
  listarUsuariosDisponibles,
} from './admin.controller';

const router = Router();

// ── Auth + SUPERADMIN guard ───────────────────────────────────

router.use(authenticate);

router.use((req: Request, _res: Response, next: NextFunction) => {
  if ((req.user as any)?.rol !== 'SUPERADMIN') {
    return next(new AppError('Acceso restringido a SUPERADMIN', 403));
  }
  next();
});

// ── Rutas ─────────────────────────────────────────────────────

router.get('/usuarios',                        listarUsuariosAdmin);
router.get('/usuarios/:id',                    obtenerUsuarioAdmin);
router.post('/usuarios',                       crearUsuario);
router.patch('/usuarios/:id',                  editarUsuario);
router.patch('/usuarios/:id/toggle-activo',    toggleActivoUsuario);
router.patch('/usuarios/:id/reset-password',   resetPassword);
router.get('/oficinas',                        listarOficinas);

// ── Módulos ───────────────────────────────────────────────────
router.get('/modulos',                              listarModulos);
router.get('/usuarios/:id/modulos',                 listarModulosUsuario);
router.post('/usuarios/:id/modulos/:moduloId',      habilitarModulo);
router.delete('/usuarios/:id/modulos/:moduloId',    revocarModulo);

// ── Flujos ────────────────────────────────────────────────────
router.get('/flujos',                                          listarFlujos);
router.put('/flujos/:modulo/:rol',                             actualizarFlujo);
router.delete('/flujos/:modulo/:rol/:unidadId',                eliminarFlujoUnidad);
router.get('/flujos/:modulo/:rol/usuarios-disponibles',        listarUsuariosDisponibles);

export default router;
