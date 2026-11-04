import { Router, Request } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireModulo } from '../../middleware/modulo.middleware';
import { AppError } from '../../utils/AppError';
import { delegacionGestion, GestionRepository } from './gestion.repository';
import { ConsultaGestion } from './gestion.types';
import { crearManejadorCancelableGestion, ControlConsultaGestion } from './gestion.cancelacion';

const texto = (v: unknown, nombre: string, max = 200) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new AppError(`Indica ${nombre} válido.`, 400);
  return v.trim().toUpperCase();
};
const entero = (v: unknown, defecto: number, max: number) => {
  if (v === undefined) return defecto;
  if (typeof v !== 'string' || !/^\d+$/.test(v) || Number(v) < 1 || Number(v) > max) throw new AppError('La página o el tamaño solicitado no es válido.', 400);
  return Number(v);
};

export function crearRouterGestion(factory: (control?: ControlConsultaGestion) => GestionRepository = control => new GestionRepository(undefined, control)): Router {
  const r = Router();
  r.use(authenticate);
  r.use(requireModulo('busqueda_gestion', 'Búsqueda Gestión'));
  const manejar = crearManejadorCancelableGestion(r);
  const atender = (fn: (repo: GestionRepository, req: Request) => Promise<unknown>) =>
    manejar(async (req, control) => {
      try { return await fn(factory(control), req); }
      catch (error) {
        if (error instanceof AppError) throw error;
        const code = typeof (error as any)?.code === 'string' && /^[A-Z0-9_]{3,32}$/.test((error as any).code) ? (error as any).code : '';
        throw new AppError('No se pudo consultar Búsqueda Gestión.' + (code ? ` Código: ${code}.` : '') + ' Revisa la conexión y los permisos de lectura.', 503);
      }
    });
  r.get('/delegaciones', atender(repo => repo.delegaciones()));
  r.get('/solicitudes', atender((repo, req) => {
    const delegacion = delegacionGestion(req.query.delegacion);
    const tipo = texto(req.query.tipo, 'un tipo de búsqueda');
    if (!['PRELACION', 'FOLIO', 'ESCRITURA'].includes(tipo)) throw new AppError('Tipo de búsqueda no válido.', 400);
    const criterio = texto(req.query.criterio, 'un criterio de búsqueda');
    if (tipo !== 'ESCRITURA' && !/^\d{1,9}$/.test(criterio)) throw new AppError('El folio o la prelación debe contener solamente dígitos, hasta nueve.', 400);
    if (req.query.direccion && !['asc', 'desc'].includes(String(req.query.direccion))) throw new AppError('Orden no válido.', 400);
    if (req.query.orden && !['prelacion', 'fecha', 'escritura', 'solicitante', 'notaria', 'seccion'].includes(String(req.query.orden))) throw new AppError('Columna de orden no válida.', 400);
    return repo.buscar({ delegacion, tipo: tipo.toLowerCase() as ConsultaGestion['tipo'], criterio,
      pagina: entero(req.query.pagina, 1, 10000000), pagina_sugeridos: entero(req.query.pagina_sugeridos, 1, 10000000),
      limite: entero(req.query.limite, 25, 100), orden: String(req.query.orden || 'prelacion'),
      direccion: req.query.direccion === 'desc' ? 'desc' : 'asc' });
  }));
  r.get('/solicitudes/:id/imagenes', atender((repo, req) => repo.imagenes(delegacionGestion(req.query.delegacion), req.params.id)));
  r.get('/solicitudes/:id', atender((repo, req) => repo.detalle(delegacionGestion(req.query.delegacion), req.params.id)));
  r.get('/referencias', atender((repo, req) => repo.referencias(delegacionGestion(req.query.delegacion),
    texto(req.query.criterio, 'una referencia o recibo', 25), entero(req.query.pagina, 1, 10000000), entero(req.query.limite, 25, 100))));
  return r;
}
export default crearRouterGestion();
