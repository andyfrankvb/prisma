/**
 * Routes: Director
 * File: src/modules/director/director.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import {
  getMetricas,
  getCargaAbogados,
  getVencimientos,
  getTendencia,
  getSupervision,
} from './director.controller';

const router = Router();

router.use(authenticate);

router.get('/metricas',       getMetricas);
router.get('/carga-abogados', getCargaAbogados);
router.get('/vencimientos',   getVencimientos);
router.get('/tendencia',      getTendencia);
router.get('/supervision',    getSupervision);

export default router;
