/**
 * Service: Folio de salida (Oficialía de Partes)
 * File: src/modules/oficialia_partes/folios_salida/folio-salida.service.ts
 *
 * Capa de dominio: reservar/formalizar/cancelar/consultar el folio de salida
 * de un oficio, y su trazabilidad. Sin conocimiento de HTTP — eso vive en
 * folio-salida.controller.ts.
 */
import type { Knex } from 'knex';
import { db }        from '../../../db';
import { AppError }  from '../../../utils/AppError';
import { formatearFolioSalida, mesRomanoActual } from './folio-salida.formatter';
import type {
  FolioSalidaDTO,
  FolioSalidaHistorialDTO,
  RolFormatoFolio,
} from './folio-salida.types';

interface UsuarioAuth {
  id:   number;
  rol:  string;
}

function mapRow(row: any): FolioSalidaDTO {
  return {
    id:                     row.id,
    oficio_id:              row.oficio_id,
    consecutivo:            row.consecutivo,
    folio_formateado:       row.folio_formateado,
    rol_formato:            row.rol_formato,
    anio:                   row.anio,
    mes_romano:             row.mes_romano,
    estatus:                row.estatus,
    reservado_por_id:       row.reservado_por_id,
    reservado_por_nombre:   row.reservado_por_nombre ?? null,
    reservado_en:           row.reservado_en,
    asignado_por_id:        row.asignado_por_id,
    asignado_por_nombre:    row.asignado_por_nombre ?? null,
    asignado_en:            row.asignado_en,
    cancelado_por_id:       row.cancelado_por_id,
    cancelado_en:           row.cancelado_en,
    motivo_cancelacion:     row.motivo_cancelacion,
    es_legacy:              row.es_legacy,
    origen_sid_tabla:       row.origen_sid_tabla,
    origen_sid_id:          row.origen_sid_id,
    creado_en:              row.creado_en,
  };
}

const SELECT_CON_NOMBRES = (qb: Knex.QueryBuilder) =>
  qb
    .select('folios_salida.*')
    .select(db.raw('reservado_u.nombre as reservado_por_nombre'))
    .select(db.raw('asignado_u.nombre as asignado_por_nombre'))
    .leftJoin('usuarios as reservado_u', 'reservado_u.id', 'folios_salida.reservado_por_id')
    .leftJoin('usuarios as asignado_u', 'asignado_u.id', 'folios_salida.asignado_por_id');

/** El código de unidad que exige la plantilla DIRECTOR_JURIDICO (catalogo_unidades.codigo_folio). */
async function codigoUnidadJuridica(trx: Knex.Transaction): Promise<string> {
  const unidad = await trx('catalogo_unidades')
    .where('tipo', 'DIRECCION')
    .andWhere('activo', true)
    .whereRaw("translate(lower(nombre),'áéíóú','aeiou') LIKE '%juridic%'")
    .select('codigo_folio')
    .first();
  if (!unidad?.codigo_folio) {
    throw new AppError('No se encontró el código de folio de la Dirección Jurídica en catalogo_unidades', 500);
  }
  return unidad.codigo_folio;
}

async function siguienteConsecutivo(trx: Knex.Transaction): Promise<number> {
  const { rows } = await trx.raw(`SELECT nextval('folio_salida_consecutivo_seq') AS n`);
  return Number(rows[0].n);
}

async function registrarHistorial(
  trx: Knex.Transaction,
  folioSalidaId: number,
  oficioId: number | null,
  evento: 'RESERVADO' | 'ASIGNADO' | 'CANCELADO',
  usuario: UsuarioAuth,
  extra: { estadoOficio?: string | null; versionProyecto?: number | null; hashDocumento?: string | null } = {},
): Promise<void> {
  await trx('folio_salida_historial').insert({
    folio_salida_id:  folioSalidaId,
    oficio_id:        oficioId,
    evento,
    usuario_id:       usuario.id,
    rol_usuario:      usuario.rol,
    estado_oficio:    extra.estadoOficio ?? null,
    version_proyecto: extra.versionProyecto ?? null,
    hash_documento:   extra.hashDocumento ?? null,
  });
}

/**
 * Reserva un folio de salida para un oficio. Lo puede pedir el Analista
 * Jurídico (rol_formato JURIDICO, al subir su proyecto) o directamente el
 * Director Jurídico (rol_formato DIRECTOR_JURIDICO, al aprobar). Un oficio no
 * puede tener dos folios vivos: si ya hay uno RESERVADO o ASIGNADO, se rechaza
 * — hay que cancelarlo primero.
 */
export async function reservarFolioSalida(
  oficioId: number,
  rolFormato: Extract<RolFormatoFolio, 'JURIDICO' | 'DIRECTOR_JURIDICO'>,
  usuario: UsuarioAuth,
  trxExterna?: Knex.Transaction,
): Promise<FolioSalidaDTO> {
  const ejecutar = async (trx: Knex.Transaction): Promise<FolioSalidaDTO> => {
    const existente = await trx('folios_salida')
      .where({ oficio_id: oficioId })
      .whereNot('estatus', 'CANCELADO')
      .first();
    if (existente) {
      throw new AppError(`Este oficio ya tiene un folio de salida (${existente.folio_formateado})`, 409);
    }

    const consecutivo = await siguienteConsecutivo(trx);
    const anio        = new Date().getFullYear();
    const mesRomano   = mesRomanoActual();
    const codigoUnidad = rolFormato === 'DIRECTOR_JURIDICO' ? await codigoUnidadJuridica(trx) : undefined;
    const folioFormateado = formatearFolioSalida(rolFormato, { consecutivo, anio, mesRomano, codigoUnidad });

    const [{ id }] = await trx('folios_salida')
      .insert({
        oficio_id:        oficioId,
        consecutivo,
        folio_formateado: folioFormateado,
        rol_formato:      rolFormato,
        anio,
        mes_romano:       mesRomano,
        estatus:          'RESERVADO',
        reservado_por_id: usuario.id,
        reservado_en:     new Date(),
      })
      .returning('id');

    await registrarHistorial(trx, id, oficioId, 'RESERVADO', usuario);

    const row = await SELECT_CON_NOMBRES(trx('folios_salida')).where('folios_salida.id', id).first();
    return mapRow(row);
  };

  return trxExterna ? ejecutar(trxExterna) : db.transaction(ejecutar);
}

/**
 * Formaliza el folio de un oficio: lo deja ASIGNADO. Si ya había uno
 * RESERVADO (por el Analista o por el propio Director), solo cambia de
 * estatus y conserva el formato con el que se reservó. Si no había ninguno,
 * el Director lo genera aquí mismo con la plantilla DIRECTOR_JURIDICO —
 * formalizar es también una forma válida de reservar.
 */
export async function formalizarFolioSalida(
  oficioId: number,
  usuario: UsuarioAuth,
  trxExterna?: Knex.Transaction,
  extra: { estadoOficio?: string | null; versionProyecto?: number | null; hashDocumento?: string | null } = {},
): Promise<FolioSalidaDTO> {
  const ejecutar = async (trx: Knex.Transaction): Promise<FolioSalidaDTO> => {
    const existente = await trx('folios_salida')
      .where({ oficio_id: oficioId })
      .whereNot('estatus', 'CANCELADO')
      .first();

    if (existente?.estatus === 'ASIGNADO') {
      throw new AppError(`El folio ${existente.folio_formateado} ya está asignado`, 409);
    }

    // Sin folio reservado, formalizar es también una forma válida de reservar:
    // el Director genera aquí mismo el de su propia plantilla.
    const folioId = existente
      ? existente.id
      : (await reservarFolioSalida(oficioId, 'DIRECTOR_JURIDICO', usuario, trx)).id;

    await trx('folios_salida').where({ id: folioId }).update({
      estatus: 'ASIGNADO', asignado_por_id: usuario.id, asignado_en: new Date(),
    });
    await registrarHistorial(trx, folioId, oficioId, 'ASIGNADO', usuario, extra);

    const row = await SELECT_CON_NOMBRES(trx('folios_salida')).where('folios_salida.id', folioId).first();
    return mapRow(row);
  };

  return trxExterna ? ejecutar(trxExterna) : db.transaction(ejecutar);
}

/** Cancela el folio vivo de un oficio (reservado o ya asignado). Libera el número: no se reutiliza. */
export async function cancelarFolioSalida(
  oficioId: number,
  motivo: string,
  usuario: UsuarioAuth,
): Promise<void> {
  await db.transaction(async (trx) => {
    const existente = await trx('folios_salida')
      .where({ oficio_id: oficioId })
      .whereNot('estatus', 'CANCELADO')
      .first();
    if (!existente) throw new AppError('Este oficio no tiene un folio de salida vigente', 404);

    await trx('folios_salida').where({ id: existente.id }).update({
      estatus: 'CANCELADO',
      cancelado_por_id: usuario.id,
      cancelado_en: new Date(),
      motivo_cancelacion: motivo,
    });
    await registrarHistorial(trx, existente.id, oficioId, 'CANCELADO', usuario);
  });
}

/** El folio vivo (no cancelado) de un oficio, o null si no tiene. */
export async function consultarFolioSalida(oficioId: number): Promise<FolioSalidaDTO | null> {
  const row = await SELECT_CON_NOMBRES(db('folios_salida'))
    .where('folios_salida.oficio_id', oficioId)
    .whereNot('folios_salida.estatus', 'CANCELADO')
    .first();
  return row ? mapRow(row) : null;
}

export interface HistorialFoliosSalidaParams {
  page?:      number;
  limit?:     number;
  search?:    string;
  soloLegacy?: boolean;
}

export interface HistorialFoliosSalidaResult {
  data:  FolioSalidaDTO[];
  total: number;
  page:  number;
  limit: number;
}

/**
 * Listado del historial completo (vivos + legacy migrados de SID), para quien
 * tenga permiso de verlo (Director Jurídico / SUPERADMIN — el filtro de rol
 * vive en el controlador, no aquí).
 */
export async function listarHistorialFoliosSalida(
  params: HistorialFoliosSalidaParams,
): Promise<HistorialFoliosSalidaResult> {
  const page  = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, params.limit ?? 20);

  let query = SELECT_CON_NOMBRES(db('folios_salida'));
  if (params.soloLegacy) query = query.andWhere('folios_salida.es_legacy', true);
  if (params.search) {
    query = query.andWhere('folios_salida.folio_formateado', 'ILIKE', `%${params.search}%`);
  }

  const total = Number(
    (await query.clone().clearSelect().count('folios_salida.id as count').first())?.count ?? 0,
  );

  const rows = await query
    .orderBy('folios_salida.creado_en', 'desc')
    .limit(limit)
    .offset((page - 1) * limit);

  return { data: rows.map(mapRow), total, page, limit };
}

/** Trazabilidad de un folio: cada paso de su ciclo de vida. */
export async function historialDeFolio(folioSalidaId: number): Promise<FolioSalidaHistorialDTO[]> {
  const rows = await db('folio_salida_historial as h')
    .leftJoin('usuarios as u', 'u.id', 'h.usuario_id')
    .where('h.folio_salida_id', folioSalidaId)
    .select('h.*', 'u.nombre as usuario_nombre')
    .orderBy('h.fecha_evento', 'asc');

  return rows.map((r) => ({
    id:               r.id,
    folio_salida_id:  r.folio_salida_id,
    oficio_id:        r.oficio_id,
    fecha_evento:     r.fecha_evento,
    evento:           r.evento,
    usuario_id:       r.usuario_id,
    usuario_nombre:   r.usuario_nombre ?? null,
    rol_usuario:      r.rol_usuario,
    estado_oficio:    r.estado_oficio,
    version_proyecto: r.version_proyecto,
    hash_documento:   r.hash_documento,
  }));
}
