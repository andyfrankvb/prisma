import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { AcervoEstado, AcervoRepository } from './acervo.types';

export function crearControladorEstado(repository: AcervoRepository) {
  return async (
    _req: Request,
    res: Response<AcervoEstado>,
    next: NextFunction,
  ): Promise<void> => {
    try {
      res.json(await repository.obtenerEstado());
    } catch (error) {
      if (error instanceof Error) {
        logger.error({ err: error, modulo: 'acervo' }, 'No se pudo consultar Acervo');
      }
      next(new AppError('No se pudo consultar la base configurada de Acervo.', 503));
    }
  };
}
