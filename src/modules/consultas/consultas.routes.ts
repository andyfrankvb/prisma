/**
 * Routes: Consulta Pública SIQROO + Catálogo de Vigilancia
 * File: src/modules/consultas/consultas.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { listarConsultas, crearConsulta } from './consultas.controller';
import {
  listarSujetosVigilados, crearSujetoVigilado, editarSujetoVigilado, cambiarEstadoSujetoVigilado,
  listarAlertas, marcarAlertaLeida,
} from './vigilancia.controller';

const router = Router();

// Pública: la llama el kiosco de Consulta Pública (SIQROO) sin sesión,
// igual que el legacy APITurnos::crearConsulta.
router.post('/', crearConsulta);

router.use(authenticate);

router.get('/', listarConsultas);

// Catálogo de Vigilancia
router.get('/vigilancia',                    listarSujetosVigilados);
router.post('/vigilancia',                   crearSujetoVigilado);
router.put('/vigilancia/:id',                editarSujetoVigilado);
router.patch('/vigilancia/:id/activo',       cambiarEstadoSujetoVigilado);
router.get('/vigilancia/alertas',            listarAlertas);
router.patch('/vigilancia/alertas/:id/leido', marcarAlertaLeida);

export default router;
