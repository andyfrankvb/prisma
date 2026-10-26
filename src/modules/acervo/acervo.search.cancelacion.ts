import { createHash } from 'node:crypto';
import { connect } from 'node:net';
import type { Knex } from 'knex';
import type { Request, RequestHandler, Router } from 'express';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

export interface ControlConsultaAcervo {
  readonly cancelada: boolean;
  ejecutar<T>(connection: Knex, sql: string, bindings: readonly (string | number)[]): Promise<T>;
}

interface SesionPostgres {
  processID: number;
  secretKey: number | Buffer;
  connectionParameters: { host: string; port: number };
  __knex__disposed?: unknown;
}

/** CancelRequest usa la identidad secreta de ESTA sesion, nunca un PID recibido del navegador. */
export function enviarCancelacionPostgres(sesion: SesionPostgres): Promise<void> {
  const { host, port } = sesion.connectionParameters;
  if (!Number.isInteger(sesion.processID) || sesion.processID <= 0 || !host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return Promise.reject(new AppError('No se pudo identificar la conexión de esta búsqueda.', 503));
  }
  let clave: Buffer;
  if (Buffer.isBuffer(sesion.secretKey)) clave = sesion.secretKey;
  else if (Number.isInteger(sesion.secretKey)) {
    clave = Buffer.alloc(4);
    clave.writeInt32BE(sesion.secretKey | 0);
  } else return Promise.reject(new AppError('La conexión no permite solicitar la cancelación.', 503));
  const paquete = Buffer.alloc(12 + clave.length);
  paquete.writeInt32BE(paquete.length, 0);
  paquete.writeInt32BE(80877102, 4);
  paquete.writeInt32BE(sesion.processID, 8);
  clave.copy(paquete, 12);
  return new Promise<void>((resolve, reject) => {
    const socket = connect({ host, port });
    let fallo: Error | undefined;
    // Este plazo solo corresponde al envio de la orden manual. No limita el SQL.
    socket.setTimeout(5000, () => socket.destroy(new Error('No se pudo enviar la cancelación.')));
    socket.once('connect', () => socket.end(paquete));
    socket.once('error', error => { fallo = error; });
    socket.once('close', () => fallo ? reject(fallo) : resolve());
  });
}

export class ConsultaCancelableAcervo implements ControlConsultaAcervo {
  cancelada = false;
  completada = false;
  registrada = false;
  fecha = Date.now();
  private cancelarSql?: () => Promise<void>;

  async cancelar(): Promise<void> {
    this.cancelada = true;
    await this.cancelarSql?.();
  }

  async ejecutar<T>(connection: Knex, sql: string, bindings: readonly (string | number)[]): Promise<T> {
    if (this.cancelada) throw new AppError('Búsqueda cancelada por el usuario.', 499);
    const cliente = await connection.client.acquireConnection() as SesionPostgres;
    let terminada = false;
    let resolverFin!: () => void;
    const fin = new Promise<void>(resolve => { resolverFin = resolve; });
    let envio: Promise<void> | undefined;
    this.cancelarSql = () => {
      if (envio) return envio;
      // Se espera la respuesta de la consulta original. Un CancelRequest puede
      // llegar antes de que PostgreSQL comience a procesarla; en ese caso se reenvia.
      const trabajo = (async () => {
        while (!terminada) {
          await enviarCancelacionPostgres(cliente);
          if (!terminada) {
            let pausa: ReturnType<typeof setTimeout> | undefined;
            await Promise.race([fin, new Promise<void>(resolve => { pausa = setTimeout(resolve, 150); })]);
            if (pausa) clearTimeout(pausa);
          }
        }
      })();
      envio = trabajo;
      void trabajo.finally(() => { if (envio === trabajo) envio = undefined; }).catch(() => {});
      return trabajo;
    };
    try {
      if (this.cancelada) throw new AppError('Búsqueda cancelada por el usuario.', 499);
      const resultado = await connection.raw<T>(sql, [...bindings]).connection(cliente);
      if (this.cancelada) throw new AppError('Búsqueda cancelada por el usuario.', 499);
      return resultado as T;
    } catch (error) {
      if (this.cancelada) throw new AppError('Búsqueda cancelada por el usuario.', 499);
      throw error;
    } finally {
      terminada = true;
      resolverFin();
      this.cancelarSql = undefined;
      if (envio) await envio.catch(() => {});
      try {
        if (this.cancelada) {
          // La sesion cancelada no se reutiliza para la consulta de otro usuario.
          cliente.__knex__disposed = new Error('Sesión descartada tras cancelación manual.');
          await connection.client.destroyRawConnection(cliente).catch(() => {});
        }
      } finally {
        await connection.client.releaseConnection(cliente);
      }
    }
  }
}

const IDENTIFICADOR = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export class RegistroCancelacionAcervo {
  private readonly consultas = new Map<string, { propietario: string; control: ConsultaCancelableAcervo }>();

  private entrada(id: string, propietario: string) {
    if (!IDENTIFICADOR.test(id)) throw new AppError('Identificador de búsqueda inválido.', 400);
    // Solo se retiran metadatos de operaciones terminadas o de cancelaciones
    // anteriores al GET. Nunca se vence ni cancela una consulta activa por tiempo.
    const ahora = Date.now();
    for (const [clave, valor] of this.consultas) {
      if ((valor.control.completada || !valor.control.registrada) && ahora - valor.control.fecha > 300000) {
        this.consultas.delete(clave);
      }
    }
    let entrada = this.consultas.get(id);
    if (entrada && entrada.propietario !== propietario) throw new AppError('No se encontró esa búsqueda.', 404);
    if (!entrada) {
      if (this.consultas.size >= 2048) {
        for (const [clave, valor] of this.consultas) if (valor.control.completada) this.consultas.delete(clave);
      }
      if (this.consultas.size >= 2048) throw new AppError('No se pudo registrar otra búsqueda. Vuelve a intentar.', 429);
      entrada = { propietario, control: new ConsultaCancelableAcervo() };
      this.consultas.set(id, entrada);
    }
    return entrada;
  }

  registrar(id: string, propietario: string): ConsultaCancelableAcervo {
    const { control } = this.entrada(id, propietario);
    if (control.registrada) throw new AppError('El identificador de búsqueda ya fue utilizado.', 409);
    control.registrada = true;
    return control;
  }

  async cancelar(id: string, propietario: string): Promise<void> {
    const { control } = this.entrada(id, propietario);
    if (!control.completada) await control.cancelar();
  }

  finalizar(control: ConsultaCancelableAcervo): void {
    control.completada = true;
    control.fecha = Date.now();
  }
}

function propietario(req: Request): string {
  const usuario = (req as Request & { user?: { id?: string | number } }).user?.id;
  if (usuario !== undefined && usuario !== null) return 'usuario:' + String(usuario);
  const autorizacion = req.get('authorization');
  if (!autorizacion) throw new AppError('Se requiere una sesión para cancelar la búsqueda.', 401);
  return 'sesion:' + createHash('sha256').update(autorizacion).digest('hex');
}

/** Se monta dentro del router ya autenticado de Acervo. Solo un POST explicito cancela SQL. */
export function crearManejadorCancelableAcervo(router: Router) {
  const registro = new RegistroCancelacionAcervo();
  router.post('/busquedas/:consultaId/cancelar', async (req, res, next) => {
    try {
      await registro.cancelar(req.params.consultaId, propietario(req));
      res.json({ estado: 'cancelada' });
    } catch (error) {
      next(error instanceof AppError ? error : new AppError('No se pudo confirmar la cancelación. Vuelve a intentar.', 503));
    }
  });
  return function manejarBusqueda<T>(action: (req: Request, control?: ControlConsultaAcervo) => Promise<T>): RequestHandler {
    return async (req, res, next) => {
      let control: ConsultaCancelableAcervo | undefined;
      try {
        const id = req.get('x-acervo-consulta');
        if (id) control = registro.registrar(id, propietario(req));
        if (control?.cancelada) throw new AppError('Búsqueda cancelada por el usuario.', 499);
        const datos = await action(req, control);
        if (control?.cancelada) throw new AppError('Búsqueda cancelada por el usuario.', 499);
        if (!res.destroyed && !res.writableEnded) res.json(datos);
      } catch (error) {
        if (!res.destroyed && !res.writableEnded) {
          if (control?.cancelada) res.status(499).json({ message: 'Búsqueda cancelada por el usuario.' });
          else if (error instanceof AppError) next(error);
          else {
            logger.error({ modulo: 'acervo', codigo: (error as { code?: unknown })?.code }, 'Falló la búsqueda de Acervo');
            next(new AppError('No se pudo realizar la búsqueda en Acervo.', 503));
          }
        }
      } finally {
        if (control) registro.finalizar(control);
      }
    };
  };
}
