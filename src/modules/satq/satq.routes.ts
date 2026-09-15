/**
 * Routes: SATQ
 * File: src/modules/satq/satq.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { getResumen, getDetalle, getConceptos, getMunicipios, getDelegaciones, getProgramas, getTiposActo, getComparativoAnual, getDiagnosticoConciliacion, getEstimacionVsRecaudacion, getProyeccionAnual } from './satq.controller';

const router = Router();

router.use(authenticate);

router.get('/resumen',                    getResumen);
router.get('/detalle',                    getDetalle);
router.get('/conceptos',                  getConceptos);
router.get('/municipios',                 getMunicipios);
router.get('/delegaciones',               getDelegaciones);
router.get('/programas',                  getProgramas);
router.get('/tipos-acto',                 getTiposActo);
router.get('/comparativo-anual',          getComparativoAnual);
router.get('/diagnostico-conciliacion',   getDiagnosticoConciliacion);
router.get('/estimacion-vs-recaudacion',  getEstimacionVsRecaudacion);
router.get('/proyeccion-anual',           getProyeccionAnual);

export default router;
