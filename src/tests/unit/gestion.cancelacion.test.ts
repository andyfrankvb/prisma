import { describe, it, expect, vi } from 'vitest';
import { createServer } from 'node:net';
import { ConsultaCancelableGestion, RegistroCancelacionGestion, enviarCancelacionPostgres } from '../../modules/gestion/gestion.cancelacion';

const id = '89b57857-0320-4eb9-a326-e188fbaadad1';

describe('cancelación independiente de Gestión', () => {
  it('recuerda una cancelación que llega antes de la búsqueda', async () => {
    const registro = new RegistroCancelacionGestion();
    await registro.cancelar(id, 'persona:1');
    const control = registro.registrar(id, 'persona:1');
    const pool = { client: { acquireConnection: vi.fn() } } as any;
    await expect(control.ejecutar(pool, vi.fn())).rejects.toMatchObject({ statusCode: 499 });
    expect(pool.client.acquireConnection).not.toHaveBeenCalled();
  });
  it('rechaza a otro propietario y no cancela su búsqueda', async () => {
    const registro = new RegistroCancelacionGestion();
    const control = registro.registrar(id, 'persona:1');
    await expect(registro.cancelar(id, 'persona:2')).rejects.toMatchObject({ statusCode: 404 });
    expect(control.cancelada).toBe(false);
  });
  it('rechaza identificadores no válidos y la repetición de un identificador', () => {
    const registro = new RegistroCancelacionGestion();
    expect(() => registro.registrar('123', 'persona:1')).toThrow();
    registro.registrar(id, 'persona:1');
    expect(() => registro.registrar(id, 'persona:1')).toThrow();
  });
  it('no cancela una operación que ya terminó ni vence una operación activa por tiempo', async () => {
    const registro = new RegistroCancelacionGestion();
    const control = registro.registrar(id, 'persona:1');
    control.fecha = 0;
    registro.registrar('89b57857-0320-4eb9-a326-e188fbaadad2', 'persona:2');
    expect(control.cancelada).toBe(false);
    registro.finalizar(control);
    await registro.cancelar(id, 'persona:1');
    expect(control.cancelada).toBe(false);
  });
  it('valida la sesión antes de enviar el paquete de cancelación', async () => {
    await expect(enviarCancelacionPostgres({ processID: 0, secretKey: 1, connectionParameters: { host: '127.0.0.1', port: 5432 } })).rejects.toBeDefined();
  });
  it('retiene una conexión exclusiva hasta terminar y descarta la sesión cancelada', async () => {
    let rechazar!: (error: Error) => void;
    let comenzo!: () => void;
    const inicio = new Promise<void>(resolve => { comenzo = resolve; });
    const paquetes: Buffer[] = [];
    const orden: string[] = [];
    const servidor = createServer(socket => {
      const partes: Buffer[] = [];
      socket.on('data', parte => partes.push(parte));
      socket.on('end', () => {
        paquetes.push(Buffer.concat(partes));
        socket.end();
        // El primer CancelRequest puede adelantarse al inicio del SELECT.
        if (paquetes.length === 2) rechazar(Object.assign(new Error('cancelada'), { code: '57014' }));
      });
    });
    await new Promise<void>(resolve => servidor.listen(0, '127.0.0.1', resolve));
    const direccion = servidor.address() as { port: number };
    const sesion = { processID: 1234, secretKey: 9876, connectionParameters: { host: '127.0.0.1', port: direccion.port } };
    const pool = { client: {
      acquireConnection: vi.fn(async () => sesion),
      destroyRawConnection: vi.fn(async () => { orden.push('descartar'); }),
      releaseConnection: vi.fn(async () => { orden.push('liberar'); }),
    } } as any;
    const control = new ConsultaCancelableGestion();
    try {
      const consulta = control.ejecutar(pool, async actual => {
        expect(actual).toBe(sesion); comenzo();
        return new Promise<void>((_resolve, reject) => { rechazar = reject; });
      });
      const resultado = expect(consulta).rejects.toMatchObject({ statusCode: 499 });
      await inicio;
      expect(pool.client.releaseConnection).not.toHaveBeenCalled();
      await control.cancelar(); await resultado;
      expect(paquetes).toHaveLength(2);
      for (const paquete of paquetes) {
        expect(paquete.length).toBe(16);
        expect(paquete.readInt32BE(4)).toBe(80877102);
        expect(paquete.readInt32BE(8)).toBe(1234);
        expect(paquete.readInt32BE(12)).toBe(9876);
      }
      expect(orden).toEqual(['descartar', 'liberar']);
    } finally { await new Promise<void>(resolve => servidor.close(() => resolve())); }
  });
  it('libera normalmente las conexiones que no se cancelan', async () => {
    const sesion = {};
    const pool = { client: { acquireConnection: vi.fn(async () => sesion), releaseConnection: vi.fn(), destroyRawConnection: vi.fn() } } as any;
    const control = new ConsultaCancelableGestion();
    expect(await control.ejecutar(pool, async actual => { expect(actual).toBe(sesion); return 42; })).toBe(42);
    expect(pool.client.releaseConnection).toHaveBeenCalledWith(sesion);
    expect(pool.client.destroyRawConnection).not.toHaveBeenCalled();
  });
});
