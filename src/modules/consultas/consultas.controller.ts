/**
 * Controller: Consulta Pública SIQROO
 * File: src/modules/consultas/consultas.controller.ts
 *
 * Capa HTTP delgada: parsea y valida `Request`/`Response` de Express y
 * delega la lógica de negocio/persistencia a
 * services/consulta-api.service.ts — este archivo no ejecuta queries
 * directamente.
 *
 * Migrado desde SID (backend/app/Http/Controllers/APITurnos.php —
 * listarConsultas + crearConsulta — y backend/app/Models/Consulta.php).
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET  /consultas → histórico de búsquedas, paginado y filtrable (con sesión)
 *  POST /consultas → registra una búsqueda — la llama el kiosco de Consulta
 *                     Pública (SIQROO) sin sesión, igual que el legacy
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/AppError';
import { logger }   from '../../utils/logger';
import { ConsultaListRequestDTO, ConsultaCreateRequestDTO, ConsultaCreateResponseDTO, ValorBusqueda } from './dtos/consulta.dto';
import * as consultaApiService from './services/consulta-api.service';
import { evaluarYRegistrarAlertas } from './vigilancia.matching';

const PER_PAGE_MAX = 50;

/** Recorta y valida un filtro de texto opcional — igual que `nullable|string|max:N` en Laravel. */
function stringOpcional(valor: unknown, campo: string, maxLen: number): string | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const texto = String(valor).trim();
  if (!texto) return undefined;
  if (texto.length > maxLen) throw new AppError(`${campo} no puede exceder ${maxLen} caracteres`, 400);
  return texto;
}

/** Valida un filtro entero opcional — igual que `nullable|int|min:N|max:M` en Laravel. */
function enteroOpcional(valor: unknown, campo: string, min: number, max?: number): number | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new AppError(`${campo} debe ser un número entero`, 400);
  if (n < min) throw new AppError(`${campo} debe ser mayor o igual a ${min}`, 400);
  if (max !== undefined && n > max) throw new AppError(`${campo} no puede exceder ${max}`, 400);
  return n;
}

function leerFiltros(req: Request): ConsultaListRequestDTO {
  return {
    codigo_acceso:   stringOpcional(req.query.codigo_acceso,   'codigo_acceso',   100),
    filtro_busqueda: stringOpcional(req.query.filtro_busqueda, 'filtro_busqueda', 255),
    nombre_completo: stringOpcional(req.query.nombre_completo, 'nombre_completo', 255),
    busqueda:        stringOpcional(req.query.busqueda,        'busqueda',        255),
    // `oficina` es texto en la BD real de SID (códigos como "1", "2"...), no un id numérico.
    oficina:         stringOpcional(req.query.oficina, 'oficina', 100),
    page:            enteroOpcional(req.query.page,    'page',    1),
    per_page:        enteroOpcional(req.query.per_page, 'per_page', 1, PER_PAGE_MAX),
  };
}

// ── GET /consultas ──────────────────────────────────────────────
export async function listarConsultas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filtros = leerFiltros(req);
    const resp = await consultaApiService.listarConsultas(filtros);
    res.json(resp);
  } catch (err) { next(err); }
}

const NOMBRE_COMPLETO_MAX_LEN = 255;
const CODIGO_ACCESO_MAX_LEN   = 100;
const FILTRO_BUSQUEDA_MAX_LEN = 255;
const TIPO_USUARIO_MAX_LEN    = 100;

/** Valida que cada valor del JSON de búsqueda sea un tipo primitivo — nunca `any`. */
function validarValorBusqueda(valor: unknown, clave: string): ValorBusqueda {
  if (valor === null)             return null;
  if (typeof valor === 'string')  return valor;
  if (typeof valor === 'number')  return valor;
  if (typeof valor === 'boolean') return valor;
  throw new AppError(`busqueda.${clave} debe ser texto, número, booleano o nulo`, 400);
}

function validarPayloadCreacion(body: unknown): ConsultaCreateRequestDTO {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.codigo_acceso !== 'string' || !b.codigo_acceso.trim()) {
    throw new AppError('codigo_acceso es requerido', 400);
  }
  if (b.codigo_acceso.trim().length > CODIGO_ACCESO_MAX_LEN) {
    throw new AppError(`codigo_acceso no puede exceder ${CODIGO_ACCESO_MAX_LEN} caracteres`, 400);
  }
  if (b.busqueda === null || typeof b.busqueda !== 'object' || Array.isArray(b.busqueda)) {
    throw new AppError('busqueda es requerida y debe ser un objeto', 400);
  }

  const busquedaEntrada = b.busqueda as Record<string, unknown>;
  const busqueda: Record<string, ValorBusqueda> = {};
  for (const [clave, valor] of Object.entries(busquedaEntrada)) {
    busqueda[clave] = validarValorBusqueda(valor, clave);
  }

  return {
    codigo_acceso:   b.codigo_acceso.trim(),
    busqueda,
    nombre_completo: stringOpcional(b.nombre_completo, 'nombre_completo', NOMBRE_COMPLETO_MAX_LEN),
    filtro_busqueda: stringOpcional(b.filtro_busqueda, 'filtro_busqueda', FILTRO_BUSQUEDA_MAX_LEN),
    tipo_usuario:    stringOpcional(b.tipo_usuario,    'tipo_usuario',    TIPO_USUARIO_MAX_LEN),
  };
}

// ── POST /consultas ─────────────────────────────────────────────
export async function crearConsulta(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const datos = validarPayloadCreacion(req.body);
    const { consulta, esTemporal } = await consultaApiService.registrarConsulta(datos);

    // No bloqueante: la respuesta al kiosco no espera al matching de vigilancia.
    // evaluarYRegistrarAlertas atrapa sus propios errores — nunca puede tumbar esta petición.
    evaluarYRegistrarAlertas(consulta).catch((err) =>
      logger.error({ err, consulta_id: consulta.id }, 'evaluarYRegistrarAlertas (fire-and-forget) falló'),
    );

    const resp: ConsultaCreateResponseDTO = {
      data:    consulta,
      message: esTemporal ? 'Consulta temporal registrada correctamente.' : 'Consulta registrada correctamente.',
    };
    res.status(201).json(resp);
  } catch (err) { next(err); }
}
