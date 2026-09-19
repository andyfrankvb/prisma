/**
 * Routes: Máquinas
 * File: src/modules/maquinas/maquinas.routes.ts
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireSuperadmin } from '../../middleware/modulo.middleware';
import {
  listarMaquinas, obtenerMaquina, crearMaquina, editarMaquina, eliminarMaquina,
} from './maquinas.controller';

const router = Router();

router.use(authenticate);

router.get('/',      listarMaquinas);
router.get('/:id',   obtenerMaquina);
// Consultar el catálogo, cualquiera con sesión; modificarlo, solo administración
// (no tiene módulo propio que asignar).
router.post('/',      requireSuperadmin, crearMaquina);
router.put('/:id',    requireSuperadmin, editarMaquina);
router.delete('/:id', requireSuperadmin, eliminarMaquina);

export default router;
