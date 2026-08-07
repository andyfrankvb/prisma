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
  getDocumentos,
  aprobarVobo,
  finalizarOficio,
  completarSiqroo,
  getCandidatosAsignacion,
  OFICIO_DOC_FIELDS,
} from './oficios.controller';
import {
  listarDependencias,
  crearDependencia,
  editarDependencia,
  eliminarDependencia,
  listarUnidadesInternas,
  crearUnidadInterna,
  editarUnidadInterna,
  eliminarUnidadInterna,
  listarRemitentes,
  crearRemitente,
  editarRemitente,
  eliminarRemitente,
  dependenciaASubunidad,
  subunidadADependencia,
  moverSubunidad,
} from './catalogos.controller';

const router = Router();

const PDF_WORD = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const IMAGENES = ['image/jpeg', 'image/png'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 200 * 1024 * 1024 },   // 200 MB — prácticamente sin límite para oficios
  fileFilter: (_req, file, cb) => {
    if (PDF_WORD.includes(file.mimetype)) cb(null, true);
    else {
      const err: any = new Error('Solo se permiten archivos PDF o Word (.pdf, .doc, .docx).');
      err.statusCode = 415;
      cb(err);
    }
  },
});

/**
 * Multer para el ingreso de oficio. Ya no hay PDF principal aparte: el documento
 * "Oficio" (uno de los 5) es el principal y el único que se OCR-ea, por eso solo él
 * exige PDF/Word. Los demás documentos y la boleta SIQROO admiten además imágenes.
 */
const uploadOficio = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 200 * 1024 * 1024 },   // 200 MB — prácticamente sin límite para oficios
  fileFilter: (_req, file, cb) => {
    const permitidos = file.fieldname === 'oficio' ? PDF_WORD : [...PDF_WORD, ...IMAGENES];
    if (permitidos.includes(file.mimetype)) cb(null, true);
    else {
      const err: any = new Error(`Tipo de archivo no permitido para "${file.fieldname}".`);
      err.statusCode = 415;
      cb(err);
    }
  },
});

const oficioUploadFields = uploadOficio.fields([
  ...OFICIO_DOC_FIELDS.map((name) => ({ name, maxCount: 1 })),
  { name: 'boleta', maxCount: 1 },   // boleta de ingreso SIQROO (opcional)
]);

router.use(authenticate);

/** POST /oficios/analizar-pdf — analiza PDF con IA, devuelve campos pre-llenados */
router.post('/oficios/analizar-pdf', upload.single('pdf'), analizarPdf);

/** GET /oficios — listado filtrado por rol */
router.get('/oficios', listarOficios);

/** GET /oficios/candidatos-asignacion — jurídicos de la unidad del encargado (con módulo) */
router.get('/oficios/candidatos-asignacion', getCandidatosAsignacion);

/** POST /oficios — registro de nuevo oficio (PDF obligatorio + 5 documentos opcionales) */
router.post('/oficios', oficioUploadFields, crearOficio);

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

/** GET /oficios/:id/documentos — documentos categorizados adjuntos (ver/descargar) */
router.get('/oficios/:id/documentos', getDocumentos);

/** PATCH /oficios/:id/vobo — encargado aprueba borrador */
router.patch('/oficios/:id/vobo', aprobarVobo);

/** POST /oficios/:id/finalizar — secretaría sube documento firmado */
router.post('/oficios/:id/finalizar', upload.single('file'), finalizarOficio);

/** PATCH /oficios/:id/siqroo — completar datos SIQROO pendientes (nro. control y/o boleta) */
router.patch('/oficios/:id/siqroo', uploadOficio.single('boleta'), completarSiqroo);

// ── Catálogos en cascada: Dependencia → Sub-unidad → Remitente ──
// Dependencias (raíz)
router.get ('/catalogos/dependencias',        listarDependencias);
router.post('/catalogos/dependencias',        crearDependencia);
router.patch('/catalogos/dependencias/:id',   editarDependencia);
router.delete('/catalogos/dependencias/:id',  eliminarDependencia);
// Sub-unidades (dentro de una dependencia)
router.get ('/catalogos/dependencias/:id/unidades-internas',  listarUnidadesInternas);
router.post('/catalogos/dependencias/:id/unidades-internas',  crearUnidadInterna);
router.patch('/catalogos/unidades-internas/:id',              editarUnidadInterna);
router.delete('/catalogos/unidades-internas/:id',             eliminarUnidadInterna);
// Reorganizar la jerarquía (SUPERADMIN)
router.post ('/catalogos/dependencias/:id/convertir-en-subunidad',      dependenciaASubunidad);
router.post ('/catalogos/unidades-internas/:id/convertir-en-dependencia', subunidadADependencia);
router.patch('/catalogos/unidades-internas/:id/mover',                  moverSubunidad);
// Remitentes (personas) — catálogo GLOBAL independiente
router.get ('/catalogos/remitentes',        listarRemitentes);
router.post('/catalogos/remitentes',        crearRemitente);
router.patch('/catalogos/remitentes/:id',   editarRemitente);
router.delete('/catalogos/remitentes/:id',  eliminarRemitente);

export default router;
