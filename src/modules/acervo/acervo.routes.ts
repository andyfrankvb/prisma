import { Router, RequestHandler } from 'express';
import { crearControladorEstado } from './acervo.controller';
import { AcervoRepository } from './acervo.types';

export function crearRouterAcervo(
  repository: AcervoRepository,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/estado', crearControladorEstado(repository));
  return router;
}
