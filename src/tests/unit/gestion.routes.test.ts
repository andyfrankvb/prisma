import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../middleware/auth.middleware', () => ({ authenticate: (req: any, _res: any, next: any) => {
  if (req.headers.authorization !== 'Bearer test') return next(Object.assign(new Error('Token requerido'), { statusCode: 401 }));
  req.user = { rol: req.headers['x-rol'] || 'OPERATIVO' }; next();
} }));
vi.mock('../../middleware/modulo.middleware', () => ({ requireModulo: (clave: string) => (req: any, _res: any, next: any) => {
  if (clave !== 'busqueda_gestion' || (req.user.rol !== 'SUPERADMIN' && req.headers['x-modulo'] !== clave))
    return next(Object.assign(new Error('Sin modulo'), { statusCode: 403 }));
  next();
} }));
import { crearRouterGestion } from '../../modules/gestion/gestion.routes';

function setup() {
  const repo = { delegaciones: vi.fn(async () => []), buscar: vi.fn(async () => ({ exactos: { filas: [], total: 0 } })),
    detalle: vi.fn(), imagenes: vi.fn(), referencias: vi.fn() };
  const factory = vi.fn(() => repo as any);
  const app = express(); app.use('/api/v1/gestion', crearRouterGestion(factory));
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || 500).json({ message: err.message }));
  const get = (path: string) => request(app).get('/api/v1/gestion' + path).set('Authorization', 'Bearer test').set('x-modulo', 'busqueda_gestion');
  return { app, repo, factory, get };
}
describe('Rutas independientes de Gestion', () => {
  it('exige autenticacion antes de abrir la conexion de Gestion', async () => {
    const s = setup(); expect((await request(s.app).get('/api/v1/gestion/delegaciones')).status).toBe(401); expect(s.factory).not.toHaveBeenCalled();
  });
  it('exige su propio modulo y no acepta el permiso de Acervo', async () => {
    const s = setup(); expect((await request(s.app).get('/api/v1/gestion/delegaciones').set('Authorization', 'Bearer test').set('x-modulo', 'busqueda_acervo')).status).toBe(403);
    expect(s.factory).not.toHaveBeenCalled();
  });
  it('acepta al administrador segun el middleware del proyecto', async () => {
    const s = setup(); expect((await request(s.app).get('/api/v1/gestion/delegaciones').set('Authorization', 'Bearer test').set('x-rol', 'SUPERADMIN')).status).toBe(200);
  });
  it('valida esquema, pagina, orden e identificadores antes de consultar', async () => {
    const s = setup(); const base = '/solicitudes?delegacion=chetumal&tipo=folio&criterio=21833';
    for (const path of [base + '&pagina=-1', base + '&orden=DROP', base.replace('chetumal', 'public'), base.replace('21833', '1%3BSELECT')]) expect((await s.get(path)).status).toBe(400);
    expect(s.repo.buscar).not.toHaveBeenCalled();
  });
  it('preserva ceros del criterio y paginas independientes de escritura', async () => {
    const s = setup(); expect((await s.get('/solicitudes?delegacion=chetumal&tipo=escritura&criterio=000555&pagina=2&pagina_sugeridos=3&limite=10')).status).toBe(200);
    expect(s.repo.buscar.mock.calls[0][0]).toMatchObject({ criterio: '000555', pagina: 2, pagina_sugeridos: 3, limite: 10 });
  });
  it('no expone mensajes del controlador ni contrasenas', async () => {
    const s = setup(); s.repo.delegaciones.mockRejectedValueOnce(Object.assign(new Error('postgresql://user:secret@host'), { code: '28P01' }));
    const r = await s.get('/delegaciones'); expect(r.status).toBe(503); expect(JSON.stringify(r.body)).not.toContain('secret'); expect(r.body.message).toContain('28P01');
  });
  it('el recurso de nombres usa su ruta propia', async () => {
    const s = setup(); s.repo.imagenes.mockResolvedValueOnce([{ nom_archivo: 'GUARDADO.TIF' }]);
    const r = await s.get('/solicitudes/clave/imagenes?delegacion=chetumal');
    expect(r.status).toBe(200); expect(s.repo.imagenes).toHaveBeenCalledWith('chetumal', 'clave'); expect(s.repo.detalle).not.toHaveBeenCalled();
  });
  it('protege el POST de cancelacion con autenticacion y permiso de Gestion', async () => {
    const s = setup(); const ruta = '/api/v1/gestion/busquedas/89b57857-0320-4eb9-a326-e188fbaadad1/cancelar';
    expect((await request(s.app).post(ruta)).status).toBe(401);
    expect((await request(s.app).post(ruta).set('Authorization', 'Bearer test').set('x-modulo', 'busqueda_acervo')).status).toBe(403);
    expect(s.factory).not.toHaveBeenCalled();
  });
  it('una cancelacion anterior al GET impide ejecutar la consulta', async () => {
    const s = setup(); const id = '89b57857-0320-4eb9-a326-e188fbaadad1';
    const cancelada = await request(s.app).post('/api/v1/gestion/busquedas/' + id + '/cancelar').set('Authorization', 'Bearer test').set('x-modulo', 'busqueda_gestion');
    expect(cancelada.status).toBe(200);
    const resultado = await s.get('/solicitudes?delegacion=chetumal&tipo=folio&criterio=21833').set('X-Gestion-Consulta', id);
    expect(resultado.status).toBe(499); expect(s.factory).not.toHaveBeenCalled();
  });
});
