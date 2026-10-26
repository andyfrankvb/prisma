import { Router, Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { AcervoSearchRepository } from './acervo.search.types';
import { crearManejadorCancelableAcervo } from './acervo.search.cancelacion';
import { leerAntecedente, leerDetalle, leerInmueble } from './acervo.search.validation';

function manejar<T>(action: (req: Request) => Promise<T>) {
  return async (req: Request, res: Response<T>, next: NextFunction): Promise<void> => {
    try {
      res.json(await action(req));
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      if (error instanceof Error) logger.error({ err: error, modulo: 'acervo' }, 'Falló la búsqueda de Acervo');
      next(new AppError('No se pudo realizar la búsqueda en Acervo.', 503));
    }
  };
}

// Se monta dentro de crearRouterAcervo, después de su authenticate existente.
export function crearRouterBusquedasAcervo(repository: AcervoSearchRepository): Router {
  const router = Router();
  const manejarBusqueda = crearManejadorCancelableAcervo(router);
  router.get('/delegaciones', manejar(() => repository.delegaciones()));
  router.get('/antecedentes', manejarBusqueda((req, control) => repository.antecedentes(leerAntecedente(req.query), control)));
  router.get('/inmuebles', manejarBusqueda((req, control) => repository.inmuebles(leerInmueble(req.query), control)));
  router.get('/folios/:folioId', manejar(async req => {
    const input = leerDetalle(req.params.folioId, req.query);
    const result = await repository.detalle(input.folioId, input.delegacionId);
    if (!result) throw new AppError('No se encontró ese folio en la delegación seleccionada.', 404);
    return result;
  }));
  return router;
}
