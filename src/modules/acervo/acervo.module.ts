import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireModulo } from '../../middleware/modulo.middleware';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { crearConexionAcervo } from './acervo.connection';
import { crearControladorEstado } from './acervo.controller';
import { PostgresAcervoRepository } from './acervo.repository';
import { PostgresAcervoSearchRepository } from './acervo.search.repository';
import { crearRouterBusquedasAcervo } from './acervo.search.routes';
import { obtenerOrigenAcervo } from './acervo.origin';
import { AcervoStage } from './acervo.stage';

// La entrada autentica y comprueba la asignación antes de inicializar el pool.
// Una configuración ausente de Acervo no impide arrancar los otros módulos.
export function crearModuloAcervo(): Router {
  const router = Router();
  router.use(authenticate, requireModulo('busqueda_acervo', 'Búsqueda Acervo'));
  let contenido: Router | undefined;
  router.use((req, res, next) => {
    try {
      if (!contenido) {
        const origen = obtenerOrigenAcervo();
        const connection = crearConexionAcervo();
        const stage = origen.modo === 'servidor' ? new AcervoStage(connection, origen) : undefined;
        const consultas = Router();
        consultas.get('/estado', crearControladorEstado(new PostgresAcervoRepository(connection, origen, stage)));
        consultas.use(crearRouterBusquedasAcervo(new PostgresAcervoSearchRepository(connection, origen, stage)));
        contenido = consultas;
      }
      contenido(req, res, next);
    } catch (error) {
      logger.error({ modulo: 'acervo', codigo: (error as { code?: string })?.code }, 'No se pudo inicializar Acervo');
      next(new AppError('El servicio de Acervo no está disponible. Contacta al administrador.', 503));
    }
  });
  return router;
}
