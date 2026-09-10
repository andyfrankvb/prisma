/**
 * Routes: Usuarios
 * File: src/modules/usuarios/usuarios.routes.ts
 */

import { Router } from 'express';
import { authenticate }    from '../../middleware/auth.middleware';
import { listarUsuarios, obtenerUsuario, getMisModulos, getMisRolesFlujo,
  cambiarMiPassword,
} from './usuarios.controller';

const router = Router();

router.use(authenticate);

// IMPORTANTE: rutas específicas ANTES de /:id para evitar conflicto de rutas
// Antes de /:id, y antes que nada: es lo único que responde la API cuando la
// contraseña la puso un tercero.
router.patch('/mi-password',   cambiarMiPassword);
router.get('/mis-modulos',     getMisModulos);
router.get('/mis-roles-flujo', getMisRolesFlujo);
router.get('/',    listarUsuarios);
router.get('/:id', obtenerUsuario);

export default router;
