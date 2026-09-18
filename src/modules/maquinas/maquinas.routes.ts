/**
 * Routes: Máquinas
 * File: src/modules/maquinas/maquinas.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import {
  listarMaquinas, obtenerMaquina, crearMaquina, editarMaquina, eliminarMaquina,
} from './maquinas.controller';

const router = Router();

router.use(authenticate);

router.get('/',      listarMaquinas);
router.get('/:id',   obtenerMaquina);
router.post('/',     crearMaquina);
router.put('/:id',   editarMaquina);
router.delete('/:id', eliminarMaquina);

export default router;
