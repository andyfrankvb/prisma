/**
 * Routes: Universo de Actos Registrales (RPPC)
 * File: src/modules/actos/actos.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { getResumen, getDetalle, getCatalogo, getTipos, getOficinas, getEstatus } from './actos.controller';

const router = Router();

router.use(authenticate);

router.get('/resumen',   getResumen);
router.get('/detalle',   getDetalle);
router.get('/catalogo',  getCatalogo);
router.get('/tipos',     getTipos);
router.get('/oficinas',  getOficinas);
router.get('/estatus',   getEstatus);

export default router;
