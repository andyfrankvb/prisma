/**
 * Controller: Catálogo de Vigilancia y Alertas — Consulta Pública
 * File: src/modules/consultas/vigilancia.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET   /consultas/vigilancia              → catálogo de sujetos vigilados (filtrable)
 *  POST  /consultas/vigilancia              → alta de un sujeto vigilado
 *  PUT   /consultas/vigilancia/:id          → edición (nombre/tipo)
 *  PATCH /consultas/vigilancia/:id/activo   → activar/desactivar
 *  GET   /consultas/vigilancia/alertas      → alertas detectadas, con el detalle de la consulta y el sujeto
 *  PATCH /consultas/vigilancia/alertas/:id/leido → marcar una alerta como leída/no leída
 */

import { Request, Response, NextFunction } from 'express';
import { db }       from '../../db';
import { AppError } from '../../utils/AppError';
import { normalizarTexto } from './vigilancia.matching';
import {
  SujetoVigilado, FiltrosSujetoVigilado,
  AlertaConsultaConDetalle, FiltrosAlertaConsulta, AlertasConsultaResponse,
} from './consultas.types';

const PER_PAGE_DEFAULT = 20;
const PER_PAGE_MAX     = 50;
const NOMBRE_MAX_LEN   = 255;

// ── helpers ──────────────────────────────────────────────────────

function stringOpcional(valor: unknown, campo: string, maxLen: number): string | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const texto = String(valor).trim();
  if (!texto) return undefined;
  if (texto.length > maxLen) throw new AppError(`${campo} no puede exceder ${maxLen} caracteres`, 400);
  return texto;
}

function enteroOpcional(valor: unknown, campo: string, min: number, max?: number): number | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new AppError(`${campo} debe ser un número entero`, 400);
  if (n < min) throw new AppError(`${campo} debe ser mayor o igual a ${min}`, 400);
  if (max !== undefined && n > max) throw new AppError(`${campo} no puede exceder ${max}`, 400);
  return n;
}

function booleanoOpcional(valor: unknown, campo: string): boolean | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  if (valor === 'true' || valor === true)  return true;
  if (valor === 'false' || valor === false) return false;
  throw new AppError(`${campo} debe ser booleano`, 400);
}

function validarTipo(valor: unknown): 'PERSONA' | 'EMPRESA' {
  if (valor !== 'PERSONA' && valor !== 'EMPRESA') {
    throw new AppError("tipo debe ser 'PERSONA' o 'EMPRESA'", 400);
  }
  return valor;
}

// ── GET /consultas/vigilancia ────────────────────────────────────
export async function listarSujetosVigilados(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const f: FiltrosSujetoVigilado = {
      activo: booleanoOpcional(req.query.activo, 'activo'),
      tipo:   req.query.tipo !== undefined ? validarTipo(req.query.tipo) : undefined,
      search: stringOpcional(req.query.search, 'search', NOMBRE_MAX_LEN),
    };

    let query = db('sujeto_vigilado');
    if (f.activo !== undefined) query = query.where('activo', f.activo);
    if (f.tipo)                 query = query.where('tipo', f.tipo);
    if (f.search)                query = query.whereRaw('LOWER(nombre_razon_social) LIKE ?', [`%${f.search.toLowerCase()}%`]);

    const sujetos = await query.orderBy('nombre_razon_social', 'asc') as SujetoVigilado[];
    res.json({ data: sujetos });
  } catch (err) { next(err); }
}

// ── POST /consultas/vigilancia ───────────────────────────────────
export async function crearSujetoVigilado(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const nombre = stringOpcional(req.body?.nombre_razon_social, 'nombre_razon_social', NOMBRE_MAX_LEN);
    if (!nombre) throw new AppError('nombre_razon_social es requerido', 400);
    const tipo = validarTipo(req.body?.tipo);

    const user = req.user as any;
    const [sujeto] = await db('sujeto_vigilado')
      .insert({
        nombre_razon_social: nombre,
        nombre_normalizado:  normalizarTexto(nombre),
        tipo,
        activo:              true,
        creado_por:          user?.id,
      })
      .returning('*') as SujetoVigilado[];

    res.status(201).json({ data: sujeto, message: 'Sujeto vigilado creado correctamente.' });
  } catch (err) { next(err); }
}

// ── PUT /consultas/vigilancia/:id ────────────────────────────────
export async function editarSujetoVigilado(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new AppError('id inválido', 400);

    const existente = await db('sujeto_vigilado').where({ id }).first();
    if (!existente) throw new AppError('Sujeto vigilado no encontrado', 404);

    const nombre = stringOpcional(req.body?.nombre_razon_social, 'nombre_razon_social', NOMBRE_MAX_LEN);
    const tipo   = req.body?.tipo !== undefined ? validarTipo(req.body.tipo) : undefined;

    const cambios: Record<string, unknown> = {};
    if (nombre)      { cambios.nombre_razon_social = nombre; cambios.nombre_normalizado = normalizarTexto(nombre); }
    if (tipo)        cambios.tipo = tipo;

    if (Object.keys(cambios).length === 0) throw new AppError('Nada que actualizar', 400);

    const [sujeto] = await db('sujeto_vigilado').where({ id }).update(cambios).returning('*') as SujetoVigilado[];
    res.json({ data: sujeto, message: 'Sujeto vigilado actualizado correctamente.' });
  } catch (err) { next(err); }
}

// ── PATCH /consultas/vigilancia/:id/activo ───────────────────────
export async function cambiarEstadoSujetoVigilado(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new AppError('id inválido', 400);

    const activo = booleanoOpcional(req.body?.activo, 'activo');
    if (activo === undefined) throw new AppError('activo es requerido', 400);

    const [sujeto] = await db('sujeto_vigilado').where({ id }).update({ activo }).returning('*') as SujetoVigilado[];
    if (!sujeto) throw new AppError('Sujeto vigilado no encontrado', 404);

    res.json({ data: sujeto, message: activo ? 'Sujeto activado.' : 'Sujeto desactivado.' });
  } catch (err) { next(err); }
}

// ── GET /consultas/vigilancia/alertas ────────────────────────────
export async function listarAlertas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const f: FiltrosAlertaConsulta = {
      desde:              stringOpcional(req.query.desde, 'desde', 10),
      hasta:              stringOpcional(req.query.hasta, 'hasta', 10),
      sujeto_vigilado_id: enteroOpcional(req.query.sujeto_vigilado_id, 'sujeto_vigilado_id', 1),
      leido:              booleanoOpcional(req.query.leido, 'leido'),
      page:               enteroOpcional(req.query.page, 'page', 1),
      per_page:           enteroOpcional(req.query.per_page, 'per_page', 1, PER_PAGE_MAX),
    };

    const base = () => {
      let q = db('alerta_consulta as a')
        .join('sujeto_vigilado as s', 's.id', 'a.sujeto_vigilado_id')
        .join('consulta_publica as c', 'c.id', 'a.consulta_id');
      if (f.desde)              q = q.andWhere('a.fecha_alerta', '>=', f.desde);
      if (f.hasta)              q = q.andWhereRaw(`a.fecha_alerta < (?::date + interval '1 day')`, [f.hasta]);
      if (f.sujeto_vigilado_id) q = q.andWhere('a.sujeto_vigilado_id', f.sujeto_vigilado_id);
      if (f.leido !== undefined) q = q.andWhere('a.leido', f.leido);
      return q;
    };

    const page    = f.page ?? 1;
    const perPage = f.per_page ?? PER_PAGE_DEFAULT;

    const [{ total }] = await base().count<{ total: string }[]>({ total: 'a.id' });
    const totalNum = Number(total);
    const lastPage = Math.max(1, Math.ceil(totalNum / perPage));

    const filas = await base()
      .orderBy('a.fecha_alerta', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage)
      .select(
        'a.id', 'a.consulta_id', 'a.sujeto_vigilado_id', 'a.coincidencia_detectada', 'a.fecha_alerta', 'a.leido',
        's.nombre_razon_social as sujeto_nombre_razon_social', 's.tipo as sujeto_tipo',
        'c.nombre_completo as consulta_nombre_completo', 'c.codigo_acceso as consulta_codigo_acceso',
        'c.hora_busqueda as consulta_hora_busqueda',
      ) as AlertaConsultaConDetalle[];

    const resp: AlertasConsultaResponse = {
      data: filas,
      meta: {
        current_page: page,
        per_page:     perPage,
        total:        totalNum,
        last_page:    lastPage,
        from:         totalNum === 0 ? null : (page - 1) * perPage + 1,
        to:           totalNum === 0 ? null : Math.min(page * perPage, totalNum),
      },
    };
    res.json(resp);
  } catch (err) { next(err); }
}

// ── PATCH /consultas/vigilancia/alertas/:id/leido ────────────────
export async function marcarAlertaLeida(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new AppError('id inválido', 400);

    const leido = booleanoOpcional(req.body?.leido, 'leido') ?? true;

    const [alerta] = await db('alerta_consulta').where({ id }).update({ leido }).returning('*');
    if (!alerta) throw new AppError('Alerta no encontrada', 404);

    res.json({ data: alerta, message: leido ? 'Alerta marcada como leída.' : 'Alerta marcada como no leída.' });
  } catch (err) { next(err); }
}
