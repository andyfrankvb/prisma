/**
 * Routes: Productividad por Delegación (RPPC)
 * File: src/modules/productividad/productividad.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { getResumen, getBandeja, getTerminados, getDelegaciones, getDetalle, getRezago } from './productividad.controller';

const router = Router();

router.use(authenticate);

router.get('/resumen',       getResumen);
router.get('/bandeja',       getBandeja);
router.get('/terminados',    getTerminados);
router.get('/delegaciones',  getDelegaciones);
router.get('/detalle',       getDetalle);
router.get('/rezago',        getRezago);

export default router;
