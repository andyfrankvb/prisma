/**
 * Routes: Seguimiento de Trámites
 * File: src/modules/tramites/tramites.routes.ts
 */

import { Router } from 'express';
import multer     from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import {
  crearTramite,
  listarTramites,
  obtenerTramite,
  aprobarTramite,
  rechazarTramite,
  devolverAlDelegado,
  cerrarProceso,
  devolverAlJuridico,
  reenviarDesdeDevuelto,
  reenviarDesdeDevueltoJuridico,
  agregarComentario,
  listarComentarios,
} from './tramites.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

router.post('/',                                upload.array('archivos', 5), crearTramite);
router.get('/',                                 listarTramites);
router.get('/:id',                              obtenerTramite);
router.patch('/:id/aprobar',                    aprobarTramite);
router.patch('/:id/rechazar',                   rechazarTramite);
router.patch('/:id/devolver-delegado',          devolverAlDelegado);
router.patch('/:id/cerrar',                     cerrarProceso);
router.patch('/:id/finalizar',                  cerrarProceso);          // alias de compatibilidad
router.patch('/:id/devolver-juridico',          devolverAlJuridico);
router.patch('/:id/reenviar',                   reenviarDesdeDevuelto);
router.patch('/:id/reenviar-juridico',          reenviarDesdeDevueltoJuridico);
router.post('/:id/comentarios',                 agregarComentario);
router.get('/:id/comentarios',                  listarComentarios);

export default router;
