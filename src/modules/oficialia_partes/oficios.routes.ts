/**
 * Routes: Oficialía de Partes — Oficios
 * File:   src/modules/oficialia_partes/oficios.routes.ts
 *
 * Mount in your main app:
 *   app.use('/api/v1', oficiosRouter);
 */

import { Router } from 'express';
import multer      from 'multer';

import { authenticate } from '../../middleware/auth.middleware';
import {
  analizarPdf,
  listarOficios,
  crearOficio,
  asignarOficio,
  reasignarOficio,
  subirProyecto,
  reconsiderarOficio,
  getComentarios,
  getHistorial,
  aprobarVobo,
  finalizarOficio,
} from './oficios.controller';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else {
      const err: any = new Error('Solo se permiten archivos PDF o Word (.pdf, .doc, .docx).');
      err.statusCode = 415;
      cb(err);
    }
  },
});

router.use(authenticate);

/** POST /oficios/analizar-pdf — analiza PDF con IA, devuelve campos pre-llenados */
router.post('/oficios/analizar-pdf', upload.single('pdf'), analizarPdf);

/** GET /oficios — listado filtrado por rol */
router.get('/oficios', listarOficios);

/** POST /oficios — registro de nuevo oficio (PDF obligatorio) */
router.post('/oficios', upload.single('pdf'), crearOficio);

/** PATCH /oficios/:id/asignar — encargado asigna a abogado */
router.patch('/oficios/:id/asignar', asignarOficio);

/** PATCH /oficios/:id/reasignar — encargado reasigna a otro abogado */
router.patch('/oficios/:id/reasignar', reasignarOficio);

/** POST /oficios/:id/subir-proyecto — abogado sube borrador */
router.post('/oficios/:id/subir-proyecto', upload.single('file'), subirProyecto);

/** PATCH /oficios/:id/reconsiderar — encargado solicita correcciones */
router.patch('/oficios/:id/reconsiderar', reconsiderarOficio);

/** GET /oficios/:id/comentarios — obtener comentarios de reconsideración */
router.get('/oficios/:id/comentarios', getComentarios);

/** GET /oficios/:id/historial — movimientos (auditoría de estados) para la línea temporal */
router.get('/oficios/:id/historial', getHistorial);

/** PATCH /oficios/:id/vobo — encargado aprueba borrador */
router.patch('/oficios/:id/vobo', aprobarVobo);

/** POST /oficios/:id/finalizar — secretaría sube documento firmado */
router.post('/oficios/:id/finalizar', upload.single('file'), finalizarOficio);

export default router;
