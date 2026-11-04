import { describe, it, expect, vi } from 'vitest';
import { crearTransporteCancelableGestion } from '../../frontend/modules/gestion/controlBusquedaGestion';

describe('transporte cancelable de Gestión', () => {
  it('asocia un identificador a cada búsqueda y confirma el POST antes de abortar HTTP', async () => {
    let resolver!: (r: Response) => void;
    const transporte = vi.fn(async (_url: unknown, opciones?: RequestInit) => opciones?.method === 'POST'
      ? Response.json({ estado: 'cancelada' }) : new Promise<Response>(resolve => { resolver = resolve; }));
    const cliente = crearTransporteCancelableGestion(transporte as typeof fetch);
    const controller = new AbortController();
    const lectura = cliente.pedir('/api/v1/gestion/referencias?criterio=7777', { signal: controller.signal, headers: { Authorization: 'Bearer prueba', 'ngrok-skip-browser-warning': '1' } });
    const primera = transporte.mock.calls[0];
    const headers = new Headers(primera[1]?.headers);
    const id = headers.get('x-gestion-consulta');
    expect(id).toMatch(/^[a-f0-9-]{36}$/i);
    await cliente.cancelarBusqueda(controller.signal);
    expect(transporte.mock.calls[1][0]).toBe('/api/v1/gestion/busquedas/' + id + '/cancelar');
    const cancelacion = transporte.mock.calls[1][1]!;
    expect(cancelacion.signal).toBeUndefined();
    expect(new Headers(cancelacion.headers).get('Authorization')).toBe('Bearer prueba');
    expect(new Headers(cancelacion.headers).get('ngrok-skip-browser-warning')).toBe('1');
    expect(controller.signal.aborted).toBe(false);
    resolver(Response.json({ filas: [] })); await lectura;
    await cliente.cancelarBusqueda(controller.signal);
    expect(transporte).toHaveBeenCalledTimes(2);
  });
  it('no modifica las consultas de Acervo ni los catálogos sin señal de búsqueda', async () => {
    const transporte = vi.fn(async (_url: unknown, _opciones?: RequestInit) => Response.json([]));
    const cliente = crearTransporteCancelableGestion(transporte as typeof fetch);
    const controller = new AbortController();
    for (const url of ['/api/v1/acervo/inmuebles?folio=1', '/api/v1/gestion/delegaciones']) await cliente.pedir(url, { signal: controller.signal });
    expect(transporte.mock.calls.every(([, opciones]) => !opciones || !new Headers((opciones as RequestInit).headers).has('x-gestion-consulta'))).toBe(true);
  });
  it('conserva la espera y devuelve el error cuando el servidor no confirma la cancelación', async () => {
    let resolver!: (r: Response) => void;
    const transporte = vi.fn(async (_url: unknown, opciones?: RequestInit) => opciones?.method === 'POST'
      ? Response.json({ message: 'Reintenta' }, { status: 503 }) : new Promise<Response>(resolve => { resolver = resolve; }));
    const cliente = crearTransporteCancelableGestion(transporte as typeof fetch);
    const controller = new AbortController();
    const lectura = cliente.pedir('/api/v1/gestion/solicitudes/identidad/imagenes?delegacion=chetumal', { signal: controller.signal });
    await expect(cliente.cancelarBusqueda(controller.signal)).rejects.toThrow('Reintenta');
    expect(controller.signal.aborted).toBe(false);
    resolver(Response.json([])); await lectura;
  });
});
