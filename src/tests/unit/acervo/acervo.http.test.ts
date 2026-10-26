import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { crearRouterAcervo } from '../../../modules/acervo/acervo.routes';
import { AcervoEstado, AcervoRepository } from '../../../modules/acervo/acervo.types';

const estado: AcervoEstado = {
  estado: 'ok', modo: 'demo', base_de_datos: 'acervo_demo',
  conteos: { delegaciones: 4, folios: 40, titulares: 48, antecedentes: 48, actos: 80 },
};

// Doble de autenticación inyectado exclusivamente para estas pruebas.
const authenticate: RequestHandler = (req, res, next) => {
  if (req.headers.authorization !== 'Bearer token-de-prueba') {
    res.status(401).json({ message: 'Token requerido' });
    return;
  }
  next();
};

function crearApp(repository: AcervoRepository) {
  const app = express();
  app.use('/api/v1/acervo', crearRouterAcervo(repository, authenticate));
  app.use((error: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });
  return app;
}

describe('GET /api/v1/acervo/estado', () => {
  it('no consulta el repositorio cuando falta autenticación', async () => {
    let consultas = 0;
    const repository: AcervoRepository = {
      async obtenerEstado() { consultas += 1; return estado; },
    };
    const response = await request(crearApp(repository)).get('/api/v1/acervo/estado');
    expect(response.status).toBe(401);
    expect(consultas).toBe(0);
  });

  it('devuelve los conteos cuando la autenticación permite la petición', async () => {
    const repository: AcervoRepository = { async obtenerEstado() { return estado; } };
    const response = await request(crearApp(repository))
      .get('/api/v1/acervo/estado').set('Authorization', 'Bearer token-de-prueba');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(estado);
  });

  it('usa AppError 503 y no devuelve detalles internos si falla la base', async () => {
    const repository: AcervoRepository = {
      async obtenerEstado() { throw new Error('detalle interno de PostgreSQL'); },
    };
    const response = await request(crearApp(repository))
      .get('/api/v1/acervo/estado').set('Authorization', 'Bearer token-de-prueba');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ message: 'No se pudo consultar la base configurada de Acervo.' });
  });
});
