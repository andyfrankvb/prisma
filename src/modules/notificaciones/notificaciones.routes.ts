/**
 * Routes: Notificaciones
 * File: src/modules/notificaciones/notificaciones.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import {
  listarNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
} from './notificaciones.controller';

const router = Router();

router.use(authenticate);

router.get('/',              listarNotificaciones);
router.patch('/read-all',    marcarTodasLeidas);   // antes que /:id para no colisionar
router.patch('/:id/read',    marcarLeida);

export default router;
