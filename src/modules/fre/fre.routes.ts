/**
 * Routes: FRE
 * File: src/modules/fre/fre.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { getResumen, getDetalle, getTipos, getOficinas } from './fre.controller';

const router = Router();

router.use(authenticate);

router.get('/resumen',   getResumen);
router.get('/detalle',   getDetalle);
router.get('/tipos',     getTipos);
router.get('/oficinas',  getOficinas);

export default router;
