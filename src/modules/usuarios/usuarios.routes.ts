/**
 * Routes: Usuarios
 * File: src/modules/usuarios/usuarios.routes.ts
 */

import { Router } from 'express';
import { authenticate }    from '../../middleware/auth.middleware';
import { listarUsuarios, obtenerUsuario, getMisModulos, getMisRolesFlujo } from './usuarios.controller';

const router = Router();

router.use(authenticate);

// IMPORTANTE: rutas específicas ANTES de /:id para evitar conflicto de rutas
router.get('/mis-modulos',     getMisModulos);
router.get('/mis-roles-flujo', getMisRolesFlujo);
router.get('/',    listarUsuarios);
router.get('/:id', obtenerUsuario);

export default router;
