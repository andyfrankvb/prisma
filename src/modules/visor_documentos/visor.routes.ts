/**
 * Routes: Visor de Documentos
 * File: src/modules/visor_documentos/visor.routes.ts
 */
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import {
  listarDelegaciones, listarSecciones,
  listarTomos, buscarTomo, listarFojasDeTomo, listarLibros, mergeRango,
  listarInscripcionesDeTomo, buscarInscripcion, buscarInscripciones,
  obtenerFoja, obtenerImagen,
  obtenerDictamen, guardarDictamen,
  obtenerTranscripcion, generarTranscripcion, actualizarTranscripcion,
} from './visor.controller';

const router = Router();
router.use(authenticate);

router.get('/catalogos/delegaciones', listarDelegaciones);
router.get('/catalogos/secciones',    listarSecciones);

router.get('/libros',             listarLibros);
router.get('/inscripciones/buscar', buscarInscripciones);

router.get('/tomos',              listarTomos);
router.get('/tomos/buscar',       buscarTomo);
router.get('/tomos/:id/fojas',    listarFojasDeTomo);
router.post('/tomos/:id/merge-rango', mergeRango);
router.get('/tomos/:id/inscripciones',        listarInscripcionesDeTomo);
router.get('/tomos/:id/inscripciones/buscar', buscarInscripcion);

router.get('/fojas/:id',                obtenerFoja);
router.get('/fojas/:id/imagen',         obtenerImagen);
router.get('/fojas/:id/dictamen',       obtenerDictamen);
router.post('/fojas/:id/dictamen',      guardarDictamen);
router.get('/fojas/:id/transcripcion',  obtenerTranscripcion);
router.post('/fojas/:id/transcripcion', generarTranscripcion);
router.put('/fojas/:id/transcripcion',  actualizarTranscripcion);

export default router;
