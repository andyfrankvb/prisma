/**
 * Routes: Supervisión de Eventos
 * File: src/modules/eventos/eventos.routes.ts
 */

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import {
  crearEvento,
  listarEventos,
  obtenerEvento,
  agregarTarea,
  actualizarEstadoTarea,
  cerrarEvento,
  listarTareasArea,
  agregarComentario,
  listarComentarios,
  setFechaCompromiso,
  reasignarTarea,
  enviarRevision,
  aprobarTarea,
  devolverTarea,
  listarHistorial,
  aprobarTareaDG,
  devolverTareaDG,
  setResponsable,
  agregarDirector,
} from './eventos.controller';

// 200 MB — acepta PDF, imágenes y video
const ALLOWED_MIME = new Set([
  // Documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // Imágenes
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Video
  'video/mp4',
  'video/quicktime',       // .mov
  'video/x-msvideo',       // .avi
  'video/webm',
  'video/x-matroska',      // .mkv
  'video/mpeg',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Se aceptan PDF, imágenes y video.`));
    }
  },
});

const router = Router();

router.use(authenticate);

// IMPORTANTE: /mis-tareas debe ir ANTES de /:id para evitar conflicto de rutas
router.get('/mis-tareas', listarTareasArea);

router.post('/',           crearEvento);
router.get('/',            listarEventos);
router.get('/:id',         obtenerEvento);
router.patch('/:id/cerrar',       cerrarEvento);
router.patch('/:id/responsable',  setResponsable);
router.post ('/:id/directores',   agregarDirector);   // agregar participante a evento existente

// Tareas
router.post('/:id/tareas',                             agregarTarea);
router.patch('/:id/tareas/:tareaId/estado',            actualizarEstadoTarea);
router.patch('/:id/tareas/:tareaId/fecha-compromiso',  setFechaCompromiso);
router.patch('/:id/tareas/:tareaId/reasignar',         reasignarTarea);

// Comentarios
router.post('/:id/tareas/:tareaId/comentarios',        agregarComentario);
router.get('/:id/tareas/:tareaId/comentarios',         listarComentarios);

// Flujo de revisión — Operativo → N1 (Encargado) → N2 (DG)
router.post ('/:id/tareas/:tareaId/enviar-revision',   upload.single('documento'), enviarRevision);
router.patch('/:id/tareas/:tareaId/aprobar',           aprobarTarea);       // N1: Encargado aprueba
router.patch('/:id/tareas/:tareaId/devolver',          devolverTarea);      // N1: Encargado devuelve
router.patch('/:id/tareas/:tareaId/aprobar-dg',        aprobarTareaDG);     // N2: DG finaliza
router.patch('/:id/tareas/:tareaId/devolver-dg',       devolverTareaDG);    // N2: DG devuelve
router.get  ('/:id/tareas/:tareaId/historial',         listarHistorial);

export default router;
