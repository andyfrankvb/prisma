/**
 * Routes: Carga de Datos (Reportes)
 * File: src/modules/carga-datos/carga-datos.routes.ts
 */

import { Router } from 'express';
import multer      from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import {
  postSatqIngresos,
  getEstimacion,
  putEstimacion,
  getIntegracionSiqroo,
  putIntegracionSiqroo,
  postSincronizarSiqroo,
  getLog,
} from './carga-datos.controller';

const router = Router();

router.use(authenticate);

// Los reportes SATQ pueden traer varios años de historia en un solo archivo
// (una hoja por mes) — hasta 80 MB da margen sin ser un riesgo real.
const uploadSatq = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 80 * 1024 * 1024 },
});

router.post('/satq-ingresos', uploadSatq.single('archivo'), postSatqIngresos);

router.get('/estimacion', getEstimacion);
router.put('/estimacion', putEstimacion);

router.get ('/integracion-siqroo',              getIntegracionSiqroo);
router.put ('/integracion-siqroo',              putIntegracionSiqroo);
router.post('/integracion-siqroo/sincronizar',  postSincronizarSiqroo);

router.get('/log', getLog);

export default router;
