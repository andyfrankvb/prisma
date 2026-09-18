/**
 * Routes: Programas Sociales
 * File: src/modules/programas-sociales/programas-sociales.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { getCatalogo, getResumen, getBandeja, getTerminados, getDinero, getRezago, getDetalle } from './programas-sociales.controller';

const router = Router();

router.use(authenticate);

router.get('/catalogo',    getCatalogo);
router.get('/resumen',     getResumen);
router.get('/bandeja',     getBandeja);
router.get('/terminados',  getTerminados);
router.get('/dinero',      getDinero);
router.get('/rezago',      getRezago);
router.get('/detalle',     getDetalle);

export default router;
