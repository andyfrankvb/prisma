/**
 * Rutas: Recursos públicos (los dos apartados de la pantalla de login).
 * File: src/modules/recursos/recursos.routes.ts
 *
 * OJO: las rutas de lectura son PÚBLICAS a propósito — la pantalla de inicio de
 * sesión todavía no tiene token. Las de escritura exigen sesión + SUPERADMIN.
 */
import { Router } from 'express';
import multer     from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import {
  obtenerRecursos,
  descargarArchivo,
  obtenerConfig,
  actualizarRecurso,
  subirArchivo,
  quitarArchivo,
} from './recursos.controller';

const router = Router();

const uploadRecurso = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 50 * 1024 * 1024 },   // 50 MB
});

// Públicas (sin autenticación)
router.get('/',              obtenerRecursos);
router.get('/:slot/archivo', descargarArchivo);

// Privadas (SUPERADMIN)
router.get   ('/admin',          authenticate, obtenerConfig);
router.put   ('/:slot',          authenticate, actualizarRecurso);
router.post  ('/:slot/archivo',  authenticate, uploadRecurso.single('archivo'), subirArchivo);
router.delete('/:slot/archivo',  authenticate, quitarArchivo);

export default router;
