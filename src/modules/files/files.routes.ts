/**
 * Routes: Files
 * File: src/modules/files/files.routes.ts
 */

import { Router } from 'express';
import { authenticate }  from '../../middleware/auth.middleware';
import { serveOriginal, serveProyecto, serveFirmado, infoProyecto } from './files.controller';

const router = Router();

router.use(authenticate);

router.get('/:id/original',      serveOriginal);
router.get('/:id/proyecto/info', infoProyecto);
router.get('/:id/proyecto',      serveProyecto);
router.get('/:id/firmado',       serveFirmado);

export default router;
