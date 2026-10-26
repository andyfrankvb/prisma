import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ permitido: false, falloConfiguracion: false, pool: vi.fn(), consultas: vi.fn(), permisos: vi.fn() }));
vi.mock('../../../middleware/auth.middleware', () => ({ authenticate: (req: Request, res: Response, next: NextFunction) => {
  const token = req.get('authorization');
  if (token !== 'Bearer usuario' && token !== 'Bearer admin') { res.status(401).json({ message: 'Sesión requerida' }); return; }
  req.user = { id: 10, rol: token === 'Bearer admin' ? 'SUPERADMIN' : 'OPERATIVO' } as any;
  next();
} }));
vi.mock('../../../db', () => ({ db: () => {
  const chain = { join: () => chain, where: () => chain,
    andWhere: (key: string, value: unknown) => { if (key === 'm.clave') state.permisos(value); return chain; },
    first: async () => state.permitido ? { id: 1 } : undefined };
  return chain;
} }));
vi.mock('../../../modules/acervo/acervo.connection', () => ({ crearConexionAcervo: () => {
  state.pool(); if (state.falloConfiguracion) throw new Error('Configuración ausente');
  return { raw: state.consultas };
} }));
import { crearModuloAcervo } from '../../../modules/acervo/acervo.module';

function app() {
  const a = express();a.use('/api/v1/acervo', crearModuloAcervo());
  a.use((e: { statusCode?: number; message: string }, _req: Request, res: Response, _next: NextFunction) => res.status(e.statusCode ?? 500).json({ message: e.message }));
  a.get('/otro-modulo', (_req, res) => res.json({ ok: true }));return a;
}
beforeEach(() => { state.permitido = false;state.falloConfiguracion = false;vi.clearAllMocks();vi.stubEnv('ACERVO_ORIGEN', 'demo'); });
afterEach(() => vi.unstubAllEnvs());
describe('entrada de Acervo como módulo de PRISMA', () => {
  it('arranca sin inicializar una conexión de Acervo', () => { app();expect(state.pool).not.toHaveBeenCalled(); });
  it.each(['/estado', '/delegaciones', '/inmuebles', '/antecedentes', '/folios/101?delegacion_id=1'])('rechaza sin sesión antes de conectar: %s', async path => {
    expect((await request(app()).get('/api/v1/acervo'+path)).status).toBe(401);expect(state.pool).not.toHaveBeenCalled();
  });
  it('exige busqueda_acervo a un usuario sin permiso antes de conectar', async () => {
    const r = await request(app()).get('/api/v1/acervo/inmuebles').set('Authorization', 'Bearer usuario');
    expect(r.status).toBe(403);expect(state.permisos).toHaveBeenCalledWith('busqueda_acervo');expect(state.pool).not.toHaveBeenCalled();
  });
  it('comparte un solo pool entre las peticiones autorizadas', async () => {
    state.permitido = true;const a = app();
    expect((await request(a).get('/api/v1/acervo/inmuebles').set('Authorization', 'Bearer usuario')).status).toBe(400);
    expect((await request(a).get('/api/v1/acervo/antecedentes').set('Authorization', 'Bearer usuario')).status).toBe(400);
    expect(state.pool).toHaveBeenCalledTimes(1);expect(state.consultas).not.toHaveBeenCalled();
  });
  it('mantiene la excepción de SUPERADMIN que usa el middleware de PRISMA', async () => {
    expect((await request(app()).get('/api/v1/acervo/inmuebles').set('Authorization', 'Bearer admin')).status).toBe(400);
    expect(state.pool).toHaveBeenCalledOnce();expect(state.permisos).not.toHaveBeenCalled();
  });
  it('una configuración ausente falla solo en Acervo y permite reintentar', async () => {
    state.permitido = true;state.falloConfiguracion = true;const a = app();
    expect((await request(a).get('/otro-modulo')).status).toBe(200);
    expect((await request(a).get('/api/v1/acervo/inmuebles').set('Authorization', 'Bearer usuario')).status).toBe(503);
    expect((await request(a).get('/otro-modulo')).status).toBe(200);
    state.falloConfiguracion = false;
    expect((await request(a).get('/api/v1/acervo/inmuebles').set('Authorization', 'Bearer usuario')).status).toBe(400);
  });
  it('la cancelación también exige sesión y permiso de módulo', async () => {
    const path='/api/v1/acervo/busquedas/00112233-4455-6677-8899-aabbccddeeff/cancelar';const a=app();
    expect((await request(a).post(path)).status).toBe(401);
    expect((await request(a).post(path).set('Authorization', 'Bearer usuario')).status).toBe(403);
    expect(state.pool).not.toHaveBeenCalled();state.permitido=true;
    expect((await request(a).post(path).set('Authorization', 'Bearer usuario')).status).toBe(200);
  });
});
