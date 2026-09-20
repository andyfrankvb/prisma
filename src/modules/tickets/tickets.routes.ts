/**
 * Routes: Tickets
 * File: src/modules/tickets/tickets.routes.ts
 */

import { Router } from 'express';
import multer      from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import { ADJUNTO_MAX_BYTES, ADJUNTO_MIMES_PERMITIDOS } from './dtos/ticket.dto';
import {
  listarTickets, crearTicket, obtenerTicket, actualizarTicket,
  descargarArchivo, obtenerCatalogo, listarDestinatarios,
} from './tickets.controller';

const router = Router();

// Adjuntos: mismos límites que el legacy en el backend (Laravel
// `mimes:jpg,jpeg,png,pdf,doc,docx|max:5120` — 5 MB).
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: ADJUNTO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ADJUNTO_MIMES_PERMITIDOS[file.mimetype]) cb(null, true);
    else {
      const err: any = new Error('Tipo de archivo no permitido. Solo: JPG, PNG, PDF, DOC, DOCX.');
      err.statusCode = 415;
      cb(err);
    }
  },
});

router.use(authenticate);

router.get('/opciones/:catalogo', obtenerCatalogo);
router.get('/destinatarios',      listarDestinatarios);

router.get('/',      listarTickets);
router.post('/',     upload.array('attachments'), crearTicket);
router.get('/:id',   obtenerTicket);
router.put('/:id',   upload.array('attachments'), actualizarTicket);

router.get('/:id/archivos/:fileId/descarga', descargarArchivo);

export default router;
