/**
 * Routes: Folio de salida (Oficialía de Partes)
 * File: src/modules/oficialia_partes/folios_salida/folio-salida.routes.ts
 *
 * Mount in your main app:
 *   app.use('/api/v1', folioSalidaRouter);
 * (Después de `oficiosRouter`, que ya aplica `authenticate` — mismo montaje.)
 */
import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import {
  getFolioSalida,
  reservarFolioSalidaHandler,
  formalizarFolioSalidaHandler,
  cancelarFolioSalidaHandler,
  listarHistorialFoliosSalidaHandler,
  historialDeFolioHandler,
} from './folio-salida.controller';

const router = Router();
router.use(authenticate);

/** GET /folios-salida/historial — historial completo (vivos + legacy de SID). Va antes de "/:id/…". */
router.get('/folios-salida/historial', listarHistorialFoliosSalidaHandler);

/** GET /folios-salida/:id/historial — trazabilidad de un folio puntual */
router.get('/folios-salida/:id/historial', historialDeFolioHandler);

/** GET /oficios/:id/folio-salida — folio vigente del oficio + qué puede hacer el usuario */
router.get('/oficios/:id/folio-salida', getFolioSalida);

/** POST /oficios/:id/folio-salida/reservar — Analista o Director reservan el consecutivo */
router.post('/oficios/:id/folio-salida/reservar', reservarFolioSalidaHandler);

/** POST /oficios/:id/folio-salida/formalizar — Director Jurídico lo deja ASIGNADO */
router.post('/oficios/:id/folio-salida/formalizar', formalizarFolioSalidaHandler);

/** DELETE /oficios/:id/folio-salida — Director Jurídico o SUPERADMIN cancelan */
router.delete('/oficios/:id/folio-salida', cancelarFolioSalidaHandler);

export default router;
