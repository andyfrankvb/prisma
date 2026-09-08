/**
 * Rutas del módulo Control de Correspondencia.
 *
 * Hay DOS grupos y la diferencia es deliberada:
 *
 *   · `/paquetes/...`  exigen sesión. Armar, cerrar, cancelar, consultar.
 *   · `/publico/...`   NO la exigen. Son las que abre el QR desde la cámara del
 *                      teléfono, y se identifican con el `token` del paquete.
 *
 * Por eso `authenticate` va ruta por ruta y no con un `router.use` al principio,
 * como en los demás módulos: un `use` general dejaría fuera de servicio justo la
 * parte que tiene que funcionar sin contraseña.
 *
 * El razonamiento completo —por qué el escaneo no pide sesión y qué protege el
 * token— está en la cabecera de `paquetes.controller.ts`.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import {
  listarPaquetes, obtenerPaquete, crearPaquete,
  agregarOficio, quitarOficio, cerrarPaquete, cancelarPaquete,
  listarDestinatarios, buscarOficiosParaPaquete,
  rastrearPorToken, personasParaEscaneo, registrarTraslado, registrarEntrega,
} from './paquetes.controller';

const router = Router();

// ── Públicas (el QR) ─────────────────────────────────────────────────────────
//
// Van ANTES que las autenticadas para que ningún middleware de sesión las alcance
// por accidente si alguien agrega un `router.use` más arriba en el futuro.

/** La lista de nombres para identificarse la primera vez que se escanea. */
router.get ('/publico/personas',          personasParaEscaneo);
/** Lo que ve quien acaba de escanear: qué paquete es, qué lleva y por dónde ha pasado. */
router.get ('/publico/:token',            rastrearPorToken);
/** «Lo traigo yo» — un toque, identidad declarada. */
router.post('/publico/:token/traslado',   registrarTraslado);
/** La entrega: exige el código de cuatro dígitos del destinatario. */
router.post('/publico/:token/entrega',    registrarEntrega);

// ── Con sesión ───────────────────────────────────────────────────────────────

/** Va antes de `/paquetes/:id` para que «destinatarios» no se lea como un id. */
router.get   ('/paquetes/destinatarios',            authenticate, listarDestinatarios);
/** Buscador propio del módulo — ver el porqué en el controlador. */
router.get   ('/paquetes/buscar-oficios',           authenticate, buscarOficiosParaPaquete);

router.get   ('/paquetes',                          authenticate, listarPaquetes);
router.post  ('/paquetes',                          authenticate, crearPaquete);
router.get   ('/paquetes/:id',                      authenticate, obtenerPaquete);

router.post  ('/paquetes/:id/oficios',              authenticate, agregarOficio);
router.delete('/paquetes/:id/contenido/:contenidoId', authenticate, quitarOficio);

router.patch ('/paquetes/:id/cerrar',               authenticate, cerrarPaquete);
router.patch ('/paquetes/:id/cancelar',             authenticate, cancelarPaquete);

export default router;
