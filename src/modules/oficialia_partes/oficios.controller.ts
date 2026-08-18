/**
 * Controller: Oficialía de Partes — Oficios
 * Module:     oficialia_partes
 * File:       src/modules/oficialia_partes/oficios.controller.ts
 *
 * Endpoints
 * ─────────────────────────────────────────────────────────────
 *  GET    /oficios
 *  POST   /oficios
 *  PATCH  /oficios/:id/asignar
 *  POST   /oficios/:id/subir-proyecto
 *  PATCH  /oficios/:id/vobo
 *  POST   /oficios/:id/finalizar
 */

import { Request, Response, NextFunction } from 'express';
import { db }           from '../../db';
import { storage, compresionInfo } from '../../services/storage.service';
import { processOcr }   from '../../services/ocr.service';
import { notifyVoboAprobado } from '../../notifications/notification.dispatcher';
import { AppError }     from '../../utils/AppError';
import { logger }       from '../../utils/logger';
import { RolUsuario, EstatusOficio } from './oficios.types';

/** Documentos categorizados que acompañan al ingreso de oficio (uno por tipo) */
export const OFICIO_DOC_FIELDS = ['anexos', 'identificacion', 'oficio', 'recibos', 'solicitud'] as const;

// ─── helpers ────────────────────────────────────────────────────────────────

/** Inserts a row in auditoria_estados */
async function createAuditLog(
  trx: any,
  oficio_id: number,
  estado_anterior: EstatusOficio | null,
  estado_nuevo: EstatusOficio,
  usuario_id: number,
): Promise<void> {
  await trx('auditoria_estados').insert({
    oficio_id,
    estado_anterior,
    estado_nuevo,
    usuario_id,
    fecha_cambio: new Date(),
  });
}

/**
 * Código de nomenclatura de la oficina para el folio (va después de la fecha).
 * Se resuelve por el NOMBRE de la unidad (robusto entre entornos, donde los ids
 * pueden diferir). Coincidencia por palabra clave, sin acentos.
 */
function codigoDeUnidad(nombre: string): string {
  const n = (nombre ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (n.includes('GENERAL'))                                              return 'DG';
  if (n.includes('JURIDIC'))                                              return 'DJ';
  if (n.includes('OTHON') || n.includes('OHTON') || n.includes('BLANCO')) return 'OPB';
  if (n.includes('PLAYA'))                                                return 'PDC';
  if (n.includes('COZUMEL'))                                              return 'CZ';
  if (n.includes('BENITO'))                                               return 'BJ';
  if (n.includes('INNOVAC') || n.includes('INFORMAT') || n.includes('ARCHIVO') || n.includes('TICS')) return 'DTICS';
  if (n.includes('ADMINISTRAT'))                                          return 'DA';
  // Sin coincidencia: iniciales de las primeras palabras (fallback).
  const inic = n.replace(/[^A-Z ]/g, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 4);
  return inic || 'NA';
}

/** Returns the current estatus of an oficio or throws 404 */
async function getOficioOrFail(trx: any, id: number) {
  const oficio = await trx('oficios').where({ id }).first();
  if (!oficio) throw new AppError('Oficio no encontrado', 404);
  return oficio;
}

/**
 * Verifica si el usuario puede actuar como ENCARGADO en Oficialía de Partes.
 * Acepta rol ENCARGADO nativo O usuario configurado como ENCARGADO en flujos
 * (en cualquier delegación — el rol ahora es por unidad).
 */
async function canActAsEncargado(user: any): Promise<boolean> {
  if (user.rol === 'ENCARGADO') return true;
  try {
    const row = await db('configuracion_flujos')
      .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'ENCARGADO', usuario_id: user.id })
      .first();
    return !!row;
  } catch {
    return false;
  }
}

/**
 * Verifica si el usuario puede actuar como SECRETARIA en Oficialía de Partes.
 * Acepta rol SECRETARIA nativo O usuario configurado como SECRETARIA en flujos.
 * Mismo criterio que canActAsEncargado: así, quien esté designado como secretaria
 * en la configuración del flujo también puede subir el firmado en Dirección General,
 * aunque su rol de cuenta no sea literalmente 'SECRETARIA'.
 */
async function canActAsSecretaria(user: any): Promise<boolean> {
  if (user.rol === 'SECRETARIA') return true;
  try {
    const row = await db('configuracion_flujos')
      .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'SECRETARIA', usuario_id: user.id })
      .first();
    return !!row;
  } catch {
    return false;
  }
}

/**
 * Unidades de las que el usuario es ENCARGADO configurado. El encargado recibe los
 * oficios cuyo "dirigido a" pertenece a alguna de estas unidades.
 */
async function getUnidadesEncargado(userId: number): Promise<number[]> {
  try {
    return await db('configuracion_flujos')
      .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'ENCARGADO', usuario_id: userId })
      .whereNotNull('unidad_id')
      .pluck('unidad_id');
  } catch {
    return [];
  }
}

/**
 * Resuelve qué ENCARGADO debe recibir un oficio, según la unidad de su "dirigido a".
 * (Oficio dirigido a la DG → encargado de la unidad de la DG; a un delegado → el de su delegación.)
 */
async function resolverEncargadoDeOficio(dirigidoAId: number | null): Promise<number | null> {
  if (!dirigidoAId) return null;
  try {
    const dirigido = await db('usuarios').where({ id: dirigidoAId }).select('unidad_id').first();
    if (!dirigido?.unidad_id) return null;
    const row = await db('configuracion_flujos')
      .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'ENCARGADO', unidad_id: dirigido.unidad_id })
      .select('usuario_id')
      .first();
    return row?.usuario_id ?? null;
  } catch {
    return null;
  }
}

/**
 * ¿La unidad del destinatario resuelve su propio VoBo y su propia firma?
 *
 * Aplica a las DELEGACIONES y a las DIRECCIONES de área: en ambas, el titular o el
 * encargado del área aprueban y suben el firmado, sin pasar por la secretaría.
 * La DIRECCION_GENERAL queda fuera a propósito: ahí aprueba el encargado y el
 * firmado lo sube la secretaría de la Dirección General.
 */
const TIPOS_CON_FLUJO_PROPIO = ['DELEGACION', 'DIRECCION'];
function tieneFlujoPropio(rol?: string | null, tipo?: string | null): boolean {
  return rol === 'DIRECTOR' && TIPOS_CON_FLUJO_PROPIO.includes(tipo ?? '');
}

/**
 * ¿Puede este usuario aprobar (VoBo) / reconsiderar este oficio?
 * En delegaciones y direcciones de área lo define `catalogo_unidades.vobo_por`:
 * el titular (delegado/director) o el encargado. En la Dirección General, el encargado.
 */
async function puedeAprobarOficio(user: any, dirigidoAId: number | null): Promise<boolean> {
  if (dirigidoAId) {
    const dirigido = await db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .where('u.id', dirigidoAId)
      .select('u.rol', 'cu.tipo', 'cu.vobo_por')
      .first();
    if (tieneFlujoPropio(dirigido?.rol, dirigido?.tipo)) {
      // Configurable por unidad: el VoBo lo da el ENCARGADO o el titular
      // (delegado en una delegación, director en una dirección de área).
      if (dirigido.vobo_por === 'ENCARGADO') {
        const encargadoId = await resolverEncargadoDeOficio(dirigidoAId);
        return encargadoId === user.id;
      }
      return user.id === dirigidoAId;
    }
  }
  return canActAsEncargado(user);   // DG u otro: el encargado
}

/**
 * ¿Puede este usuario subir el documento firmado y finalizar el oficio?
 * En delegaciones y direcciones de área lo puede hacer TANTO el titular como el
 * ENCARGADO de esa unidad (el primero que lo suba finaliza; el otro ya no puede
 * porque el oficio deja de estar en VOBO_APROBADO). En la Dirección General lo
 * hace la SECRETARIA.
 */
async function puedeSubirFirmado(user: any, dirigidoAId: number | null): Promise<boolean> {
  if (dirigidoAId) {
    const dirigido = await db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .where('u.id', dirigidoAId)
      .select('u.rol', 'cu.tipo')
      .first();
    if (tieneFlujoPropio(dirigido?.rol, dirigido?.tipo)) {
      if (user.id === dirigidoAId) return true;                 // el titular del área
      const encargadoId = await resolverEncargadoDeOficio(dirigidoAId);
      return encargadoId === user.id;                           // el encargado de esa unidad
    }
  }
  return canActAsSecretaria(user);   // DG: la secretaría (rol nativo o configurada en flujos)
}

// ─── POST /oficios/analizar-pdf ──────────────────────────────────────────────

/**
 * Analiza un PDF con IA y devuelve los campos extraídos para pre-llenar el formulario.
 * NO guarda nada — solo extrae y devuelve.
 *
 * Roles permitidos: OFICIAL
 * Body: multipart/form-data con campo "pdf"
 */
export async function analizarPdf(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      throw new AppError('El archivo PDF es obligatorio', 400);
    }

    const { extractFieldsFromPdf } = await import('../../services/ai-extract.service');

    // El OCR (Tesseract) y la extracción con IA pueden tardar mucho —o fallar—
    // en PDFs escaneados/grandes. En cualquiera de esos casos respondemos con
    // baja confianza (campos vacíos) para que el gateway no corte la petición
    // con 504 y el usuario simplemente capture los datos a mano en el paso 2.
    const fallback = { confianza: 'baja' as const };
    const ANALISIS_TIMEOUT_MS = 25_000;

    const timeout = new Promise<typeof fallback>((resolve) =>
      setTimeout(() => resolve(fallback), ANALISIS_TIMEOUT_MS),
    );

    // El análisis nunca rechaza: ante error devuelve el fallback. Así Promise.race
    // siempre resuelve (HTTP 200) y no hay unhandled rejection tardío.
    // Al ingresar solo se procesa la 1ª página → llenado rápido del formulario.
    // El resto del documento se extrae después en segundo plano (processOcr).
    const analisis = extractFieldsFromPdf(req.file.buffer, 1).catch((err) => {
      logger.warn({ err }, 'Análisis de PDF falló; se devuelven campos vacíos');
      return fallback;
    });

    const fields = await Promise.race([analisis, timeout]);

    res.json({ data: fields });
  } catch (err) {
    next(err);
  }
}

// ─── GET /oficios ────────────────────────────────────────────────────────────

/**
 * Listado de oficios filtrado según el rol del usuario autenticado.
 *
 * Roles y visibilidad:
 *  OFICIAL     → solo los oficios de su oficina registrados por él mismo
 *  ENCARGADO   → todos los oficios de su delegación (oficina_registro_id)
 *  JURIDICO    → oficios donde tiene una asignación activa
 *  SECRETARIA  → oficios con estatus VOBO_APROBADO o FINALIZADO
 *  DIRECTOR    → oficios con estatus VOBO_APROBADO o FINALIZADO
 */
export async function listarOficios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    let query = db('oficios')
      .leftJoin(
        db.raw(`(
          SELECT DISTINCT ON (oficio_id) oficio_id, abogado_id
          FROM asignaciones_juridicas
          ORDER BY oficio_id, id DESC
        ) as ultima_asignacion`),
        'ultima_asignacion.oficio_id', 'oficios.id'
      )
      .leftJoin('usuarios as abogado_u', 'abogado_u.id', 'ultima_asignacion.abogado_id')
      .leftJoin('usuarios as dir_u', 'dir_u.id', 'oficios.dirigido_a_id')
      .leftJoin('catalogo_unidades as dir_cu', 'dir_cu.id', 'dir_u.unidad_id')
      // Encargado configurado para la unidad del "dirigido a" (para saber quién lo tiene si no está asignado)
      .leftJoin('configuracion_flujos as cf_enc', function () {
        this.on('cf_enc.unidad_id', '=', 'dir_u.unidad_id')
            .andOnVal('cf_enc.modulo_clave', '=', 'oficialia_partes')
            .andOnVal('cf_enc.rol_flujo', '=', 'ENCARGADO');
      })
      .leftJoin('usuarios as enc_u', 'enc_u.id', 'cf_enc.usuario_id')
      .leftJoin('usuarios as oficial_u', 'oficial_u.id', 'oficios.oficial_registro_id')
      // Fecha en que se subió el firmado = cuando el oficio pasó a FINALIZADO.
      .leftJoin(
        db.raw(`(
          SELECT DISTINCT ON (oficio_id) oficio_id, fecha_cambio
          FROM auditoria_estados
          WHERE estado_nuevo = 'FINALIZADO'
          ORDER BY oficio_id, fecha_cambio DESC
        ) as fin_aud`),
        'fin_aud.oficio_id', 'oficios.id'
      )
      .select(
        'oficios.*',
        'abogado_u.nombre as abogado_nombre',
        'abogado_u.id as abogado_id',
        'dir_u.rol as dirigido_a_rol',
        'dir_u.nombre as dirigido_a_nombre',
        'dir_u.unidad_id as dirigido_a_unidad_id',
        'dir_cu.tipo as dirigido_a_unidad_tipo',
        'dir_cu.nombre as delegacion_nombre',
        'dir_cu.vobo_por as vobo_por_unidad',
        'enc_u.nombre as encargado_nombre',
        'fin_aud.fecha_cambio as fecha_firmado',
        'oficial_u.nombre as ingresado_por_nombre',
      );

    // Unidades de las que el usuario es ENCARGADO (routing por "dirigido a")
    const unidadesEncargado = await getUnidadesEncargado(user.id);
    const esEncargadoFlujo   = unidadesEncargado.length > 0;

    // Restringe la query a oficios cuyo "dirigido a" pertenece a esas unidades
    // (reusa el leftJoin dir_u de arriba).
    const scopeEncargado = (q: any) =>
      q.whereIn('dir_u.unidad_id', unidadesEncargado);

    // Ser ENCARGADO (configurado por unidad) tiene PRIORIDAD sobre el rol de sistema:
    // ve los oficios dirigidos a su(s) delegación(es) aunque su rol sea OPERATIVO,
    // DIRECTOR, etc. Solo si NO es encargado se aplica la lógica por rol.
    if (esEncargadoFlujo) {
      query = scopeEncargado(query);
    } else switch (user.rol as RolUsuario) {
      case 'OFICIAL':
        query = query
          .where('oficios.unidad_registro_id', user.oficina_id)
          .andWhere('oficios.oficial_registro_id', user.id);
        break;

      case 'OPERATIVO': {
        // Comportamiento híbrido:
        //   · Con asignaciones jurídicas → actúa como JURIDICO (ve sus oficios asignados)
        //   · Sin asignaciones           → actúa como OFICIAL  (ve lo que él mismo registró)
        //
        // DISTINCT ON en la subquery evita filas duplicadas cuando el mismo usuario
        // fue asignado, reasignado y vuelto a asignar al mismo oficio.
        const asignacionOperativo = await db('asignaciones_juridicas')
          .where({ abogado_id: user.id })
          .first();

        if (asignacionOperativo) {
          // Subquery global: DISTINCT ON sobre todas las asignaciones (sin filtrar por usuario)
          // para obtener la asignación más reciente por oficio. Luego filtra por usuario.
          // Esto evita que un abogado reasignado siga viendo el oficio en su bandeja.
          query = query
            .join(
              db.raw(`(
                SELECT oficio_id
                FROM (
                  SELECT DISTINCT ON (oficio_id) oficio_id, abogado_id
                  FROM asignaciones_juridicas
                  ORDER BY oficio_id, id DESC
                ) AS ultima_asignacion_global
                WHERE abogado_id = ?
              ) AS mis_asignaciones`, [user.id]),
              'mis_asignaciones.oficio_id',
              'oficios.id',
            );
        } else {
          query = query
            .where('oficios.unidad_registro_id', user.oficina_id)
            .andWhere('oficios.oficial_registro_id', user.id);
        }
        break;
      }

      case 'ENCARGADO':
        // Encargado nativo — ve los oficios dirigidos a su(s) delegación(es)
        if (esEncargadoFlujo) query = scopeEncargado(query);
        break;

      case 'DIRECTOR':
        if (esEncargadoFlujo) {
          // Encargado configurado (por unidad) — ve los oficios dirigidos a su delegación
          query = scopeEncargado(query);
          break;
        }
        // La Directora General ve TODOS los oficios en cualquier estatus
        // (los ingresados, los firmados, etc.) para supervisión general.
        if ((user as any).unidad_tipo === 'DIRECCION_GENERAL') {
          break;
        }
        // Titular de un área (delegación o dirección) que no es su encargado: ve los
        // oficios dirigidos a él, para estar al tanto de lo que le llega.
        //
        // Antes, un director de área sin encargado configurado caía en una regla
        // heredada que le mostraba TODOS los oficios aprobados y finalizados del
        // sistema, incluidos los de otras áreas. Se acota a lo suyo: si falta
        // configuración, el peor caso es ver de menos, nunca de más.
        query = query.where('oficios.dirigido_a_id', user.id);
        break;

      case 'JURIDICO':
        // DISTINCT ON global: primero obtiene la asignación más reciente por oficio
        // (sin filtrar por usuario), luego filtra. Garantiza que un abogado reasignado
        // deja de ver el oficio inmediatamente, sin duplicados en paginación.
        query = query
          .join(
            db.raw(`(
              SELECT oficio_id
              FROM (
                SELECT DISTINCT ON (oficio_id) oficio_id, abogado_id
                FROM asignaciones_juridicas
                ORDER BY oficio_id, id DESC
              ) AS ultima_asignacion_global
              WHERE abogado_id = ?
            ) AS mis_asignaciones`, [user.id]),
            'mis_asignaciones.oficio_id',
            'oficios.id',
          );
        break;

      case 'SECRETARIA':
        // Secretaría — ve todos los oficios del sistema
        break;

      default: {
        // Para cualquier otro rol, verificar si tiene asignaciones como jurídico
        const tieneAsignaciones = await db('asignaciones_juridicas')
          .where({ abogado_id: user.id })
          .first();
        if (tieneAsignaciones) {
          query = query
            .join(
              db.raw(`(
                SELECT oficio_id
                FROM (
                  SELECT DISTINCT ON (oficio_id) oficio_id, abogado_id
                  FROM asignaciones_juridicas
                  ORDER BY oficio_id, id DESC
                ) AS ultima_asignacion_global
                WHERE abogado_id = ?
              ) AS mis_asignaciones`, [user.id]),
              'mis_asignaciones.oficio_id',
              'oficios.id',
            );
        } else {
          throw new AppError('Rol no autorizado', 403);
        }
        break;
      }
    }

    // Optional query-string filters
    const page   = Math.max(1, parseInt(String(req.query.page  ?? 1), 10));
    const limit  = Math.min(100, parseInt(String(req.query.limit ?? 20), 10));
    const offset = (page - 1) * limit;

    // El filtro por estatus se aplica MÁS ABAJO (después de calcular los conteos
    // por estatus), para que las tarjetas de resumen muestren el conteo de TODOS
    // los estatus aunque haya un estatus seleccionado.

    // Búsqueda de texto sobre TODA la información del oficio: folio, remitente,
    // dependencia, descripción, texto OCR, número SIQROO, fecha de término, texto
    // del proyecto y el NOMBRE de los documentos subidos.
    if (req.query.search) {
      const term = `%${req.query.search}%`;
      // LEFT JOINs para buscar en el proyecto y en los documentos adjuntos.
      // DISTINCT evita filas duplicadas por la relación 1-a-muchos de documentos.
      query = query
        .leftJoin('gestiones_contestacion as gc', 'gc.oficio_id', 'oficios.id')
        .leftJoin('oficio_documentos as od', 'od.oficio_id', 'oficios.id')
        .distinct()
        .andWhere((q) =>
          q.whereILike('oficios.folio', term)
           .orWhereILike('oficios.remitente', term)
           .orWhereILike('oficios.dependencia_origen', term)
           .orWhereILike('oficios.unidad_interna', term)
           .orWhereILike('oficios.numero_oficio_origen', term)
           .orWhereILike('oficios.descripcion_solicitud', term)
           .orWhereILike('oficios.texto_ocr', term)
           .orWhereILike('oficios.siqroo_control_interno', term)
           .orWhereILike('gc.texto_proyecto', term)
           .orWhereILike('od.nombre_original', term)
           .orWhereRaw('oficios.fecha_vencimiento::text ILIKE ?', [term]),
        );
    }

    // Date-range filter on fecha_registro
    if (req.query.desde) {
      query = query.andWhere('oficios.fecha_registro', '>=', new Date(req.query.desde as string));
    }
    if (req.query.hasta) {
      // Include the full hasta day
      const hasta = new Date(req.query.hasta as string);
      hasta.setHours(23, 59, 59, 999);
      query = query.andWhere('oficios.fecha_registro', '<=', hasta);
    }

    // Filtro SIQROO pendiente: aplica a SIQROO pero sin control ni boleta
    if (req.query.siqroo_pendiente === 'true') {
      query = query
        .andWhere('oficios.siqroo_aplica', true)
        .whereNull('oficios.siqroo_control_interno')
        .whereNull('oficios.siqroo_boleta_url');
    }

    // Aprobados sin documento de firma subido: tienen VoBo pero aún no se finalizan.
    if (req.query.pendiente_firma === 'true') {
      query = query.andWhere('oficios.estatus', 'VOBO_APROBADO');
    }

    // Filtro por término / vencimiento
    if (req.query.termino) {
      const t = String(req.query.termino);
      if (t === 'con_termino') {
        query = query.andWhere('oficios.tiene_termino', true);
      } else if (t === 'vencidos') {
        query = query
          .andWhere('oficios.tiene_termino', true)
          .andWhereNot('oficios.estatus', 'FINALIZADO')
          .andWhereRaw('oficios.fecha_vencimiento::date < CURRENT_DATE');
      } else if (t === 'por_vencer') {
        query = query
          .andWhere('oficios.tiene_termino', true)
          .andWhereNot('oficios.estatus', 'FINALIZADO')
          .andWhereRaw(`oficios.fecha_vencimiento::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'`);
      }
    }

    // Filtro por área / jefe de área: oficios dirigidos a un director o delegado.
    if (req.query.dirigido_a_id) {
      query = query.andWhere('oficios.dirigido_a_id', Number(req.query.dirigido_a_id));
    }

    // Conteos por estatus (SIN el filtro de estatus, con el resto de filtros y el
    // scope del rol) — para las tarjetas de resumen de la bandeja.
    const conteoRows = await query.clone().clearSelect()
      .select('oficios.estatus')
      .countDistinct('oficios.id as count')
      .groupBy('oficios.estatus');
    const conteos: Record<string, number> = {};
    for (const r of conteoRows as any[]) conteos[String(r.estatus)] = Number(r.count);

    // Ahora sí, aplica el filtro por estatus (para la lista y el total).
    if (req.query.estatus) {
      query = query.andWhere('oficios.estatus', req.query.estatus as string);
    }

    // Count: clonar sin el SELECT. countDistinct porque el join de documentos
    // (1-a-muchos) puede duplicar filas del mismo oficio.
    const countRows = await query.clone().clearSelect().countDistinct('oficios.id as count');
    const total     = Number((countRows[0] as any)?.count ?? 0);
    const rows      = await query.orderBy('oficios.fecha_registro', 'desc').limit(limit).offset(offset);

    // Nombre de la secretaría (para "en bandeja de" cuando ya tiene VoBo)
    const secretariaRow = await db('configuracion_flujos as cf')
      .join('usuarios as u', 'u.id', 'cf.usuario_id')
      .where({ 'cf.modulo_clave': 'oficialia_partes', 'cf.rol_flujo': 'SECRETARIA' })
      .select('u.nombre')
      .first();
    const secretariaNombre: string | null = secretariaRow?.nombre ?? null;

    // ¿El usuario actual es la SECRETARIA? (rol nativo o designada en configuracion_flujos)
    const esSecretaria = await canActAsSecretaria(user);

    // Compute dias_restantes client-side to avoid DB timezone issues
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oficios = rows.map((o: any) => {
      let dias_restantes: number | null = null;
      if (o.tiene_termino && o.fecha_vencimiento) {
        const vence = new Date(o.fecha_vencimiento);
        vence.setHours(0, 0, 0, 0);
        dias_restantes = Math.ceil((vence.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      // ¿Quién tiene el oficio en su bandeja ahora? (según el estatus del flujo)
      // Delegaciones y direcciones de área resuelven su propio VoBo y su propia firma.
      const esFlujoPropio = tieneFlujoPropio(o.dirigido_a_rol, o.dirigido_a_unidad_tipo);
      // En esas unidades el VoBo lo da quien se haya configurado (catalogo_unidades.vobo_por):
      // el titular (delegado/director) o el encargado. En la Dirección General, el encargado.
      const voboLoDaElEncargado = esFlujoPropio
        ? o.vobo_por_unidad === 'ENCARGADO'
        : true;
      // Nombre de quien aprueba (para bandeja EN_REVISION y "vobo_por_nombre").
      const aprobadorNombre = voboLoDaElEncargado ? o.encargado_nombre : o.dirigido_a_nombre;

      let en_bandeja_de: string | null;
      switch (o.estatus) {
        case 'RECIBIDO':                              // sin reasignar → el encargado
          en_bandeja_de = o.encargado_nombre; break;
        case 'ASIGNADO':
        case 'EN_RECONSIDERACION':                    // reasignado → el jurídico
          en_bandeja_de = o.abogado_nombre ?? o.encargado_nombre; break;
        case 'EN_REVISION':                           // esperando VoBo → quien aprueba
          en_bandeja_de = aprobadorNombre; break;
        case 'VOBO_APROBADO':                         // listo para firma
        case 'FINALIZADO':                            // firmado/cerrado
          // Delegación o dirección de área: su encargado sube el firmado (o el titular).
          // Dirección General: la secretaría.
          en_bandeja_de = esFlujoPropio ? o.encargado_nombre : secretariaNombre; break;
        default:
          en_bandeja_de = o.encargado_nombre;
      }

      // ¿Puede el usuario actual dar el VoBo?
      const puede_vobo = voboLoDaElEncargado
        ? unidadesEncargado.includes(o.dirigido_a_unidad_id)   // el encargado de esa unidad
        : o.dirigido_a_id === user.id;                          // el delegado (dirigido a)

      // Responsable del visto bueno (nombre).
      const vobo_por_nombre = aprobadorNombre;

      // ¿Puede el usuario actual subir el firmado / finalizar este oficio?
      // Delegación o dirección de área: el titular (dirigido a) o el encargado de esa
      // unidad. Dirección General: la secretaría.
      const puede_finalizar = esFlujoPropio
        ? (o.dirigido_a_id === user.id || unidadesEncargado.includes(o.dirigido_a_unidad_id))
        : esSecretaria;

      return {
        ...o,
        dias_restantes,
        puede_vobo,
        puede_finalizar,
        en_bandeja_de,
        vobo_por_nombre,
        secretaria_nombre: secretariaNombre,
      };
    });

    res.json({
      data:  oficios,
      meta:  { total, page, limit, conteos },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /oficios ───────────────────────────────────────────────────────────

/**
 * Registro de nuevo oficio.
 *
 * Validaciones:
 *  - folio único en la tabla
 *  - archivo PDF obligatorio
 *  - fecha_vencimiento requerida cuando tiene_termino === true
 *
 * Acciones:
 *  - Guarda el PDF en storage
 *  - Inserta el oficio
 *  - Crea registro de auditoría (null → RECIBIDO)
 */
export async function crearOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const {
      remitente,
      dependencia_origen,
      unidad_interna,
      numero_oficio_origen,
      fecha_oficio,
      dirigido_a_id,
      descripcion_solicitud,
      tiene_termino,
      fecha_vencimiento,
    } = req.body;

    // ── Archivos: 5 documentos (opcionales) + boleta SIQROO (opcional) ──
    // El documento "Oficio" es el principal (se OCR-ea). Ninguno es obligatorio aún.
    const files      = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const oficioFile = files['oficio']?.[0];
    const boletaFile = files['boleta']?.[0];

    // ── SIQROO ────────────────────────────────────────────────
    const siqroo_aplica = req.body.siqroo_aplica === true || req.body.siqroo_aplica === 'true';
    const siqroo_control_interno = siqroo_aplica
      ? (String(req.body.siqroo_control_interno ?? '').trim() || null)
      : null;

    // ── Validaciones ──────────────────────────────────────────
    if (tiene_termino === true || tiene_termino === 'true') {
      if (!fecha_vencimiento) {
        throw new AppError(
          'fecha_vencimiento es requerida cuando tiene_termino es verdadero',
          400,
        );
      }
    }

    // ── Generar folio automático ──────────────────────────────
    // Formato: OF-{OFICINA_ID}-{AÑO}-{MMDD}-{SECUENCIA DIARIA 4 dígitos}
    // La secuencia REINICIA en 0001 cada día; el año se incluye para que la
    // nomenclatura cambie sola al iniciar un nuevo año (2026 → 2027).
    // Ejemplo: OF-37-2026-0807-0001 (primer oficio de la oficina 37 el 7-ago-2026)
    const now  = new Date();
    const dd   = String(now.getDate()).padStart(2, '0');
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const aaaa = now.getFullYear();
    const fechaFolio = `${dd}${mm}${aaaa}`;   // DDMMAAAA (día-mes-año)

    // Código de nomenclatura según el ÁREA a la que se DIRIGE/ASIGNA el oficio.
    const areaDestino = await db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .where('u.id', Number(dirigido_a_id) || 0)
      .select('cu.id as unidad_id', 'cu.nombre as unidad_nombre')
      .first();
    const codigo = codigoDeUnidad(areaDestino?.unidad_nombre ?? '');

    // Secuencia DIARIA por ÁREA DESTINO: cuenta los oficios dirigidos HOY a esa área.
    // El rango del día se calcula en la zona horaria de la app (no de la BD).
    const inicioDia = new Date(aaaa, now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const finDia    = new Date(aaaa, now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const [{ seq }] = await db('oficios as o')
      .leftJoin('usuarios as du', 'du.id', 'o.dirigido_a_id')
      .where('du.unidad_id', areaDestino?.unidad_id ?? -1)
      .andWhere('o.fecha_registro', '>=', inicioDia)
      .andWhere('o.fecha_registro', '<=', finDia)
      .count('o.id as seq');

    const secuencia = String(Number(seq) + 1).padStart(4, '0');
    const folio     = `OF-${fechaFolio}-${codigo}-${secuencia}`;

    // Garantizar unicidad en caso de concurrencia
    const existing = await db('oficios').where({ folio }).first();
    if (existing) {
      // Fallback: usar timestamp para desempate
      const ts = Date.now().toString().slice(-4);
      throw new AppError(`Folio ${folio} ya existe, intenta de nuevo`, 409);
    }

    // ── Guardar el "Oficio" como documento principal (si viene) ──
    // Es el único que se comprime y se OCR-ea. Si no se sube, pdf_original_path
    // queda nulo y no hay OCR ni autocompletado.
    let guardado: Awaited<ReturnType<typeof storage.saveWithInfo>> | null = null;
    let pdf_original_path: string | null = null;
    if (oficioFile) {
      guardado          = await storage.saveWithInfo(oficioFile, 'oficios/originales', { compress: true });
      pdf_original_path = guardado.url;
    }

    // ── Transacción ───────────────────────────────────────────
    const oficio = await db.transaction(async (trx) => {
      const [newOficio] = await trx('oficios')
        .insert({
          folio,
          // Dependencia, unidad interna y remitente siempre en MAYÚSCULAS.
          remitente:            (remitente ?? '').toUpperCase(),
          dependencia_origen:   (dependencia_origen ?? '').toUpperCase(),
          unidad_interna:       unidad_interna?.trim().toUpperCase() || null,
          numero_oficio_origen: numero_oficio_origen?.trim().toUpperCase() || null,
          fecha_oficio:         fecha_oficio?.trim() || null,
          dirigido_a_id:        dirigido_a_id ? Number(dirigido_a_id) : null,   // vacío → sin destinatario
          oficial_registro_id:  user.id,
          unidad_registro_id:   user.oficina_id,
          fecha_registro:       new Date(),
          descripcion_solicitud,
          tiene_termino:        Boolean(tiene_termino),
          fecha_vencimiento:    fecha_vencimiento ?? null,
          pdf_original_path,
          siqroo_aplica,
          siqroo_control_interno,
          estatus:              'RECIBIDO' as EstatusOficio,
        })
        .returning('*');

      await createAuditLog(trx, newOficio.id, null, 'RECIBIDO', user.id);

      // ── Documentos categorizados (opcionales) ────────────────
      // El "Oficio" reutiliza el archivo ya guardado como principal; los otros 4
      // se guardan aparte con nombre trazable `${oficioId}_${tipo}_${timestamp}`.
      for (const tipo of OFICIO_DOC_FIELDS) {
        const doc = files[tipo]?.[0];
        if (!doc) continue;

        let archivo_url: string;
        if (tipo === 'oficio') {
          archivo_url = pdf_original_path!;   // ya guardado arriba
        } else {
          const res = await storage.saveWithInfo(doc, `oficios/documentos/${tipo}`, {
            filename: `${newOficio.id}_${tipo}_${Date.now()}`,
            compress: true,   // optimiza los requisitos PDF (imágenes/Word pasan sin cambio)
          });
          archivo_url = res.url;
        }

        await trx('oficio_documentos').insert({
          oficio_id:       newOficio.id,
          tipo,
          archivo_url,
          nombre_original: doc.originalname,
          subido_por_id:   user.id,
          subido_en:       new Date(),
        });
      }

      // ── Boleta SIQROO (si aplica y viene) ────────────────────
      if (siqroo_aplica && boletaFile) {
        const res = await storage.saveWithInfo(boletaFile, 'oficios/siqroo', {
          filename: `${newOficio.id}_boleta_${Date.now()}`,
        });
        await trx('oficios').where({ id: newOficio.id }).update({ siqroo_boleta_url: res.url });
        newOficio.siqroo_boleta_url = res.url;
      }

      return newOficio;
    });

    // ── OCR asíncrono — solo si se subió el "Oficio" ──────────
    if (oficio.pdf_original_path) {
      processOcr(oficio.id, oficio.pdf_original_path).catch((err) =>
        logger.error({ err, oficio_id: oficio.id }, 'OCR background task failed'),
      );
    }

    res.status(201).json({ data: oficio, compresion: guardado ? compresionInfo(guardado) : null });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /oficios/:id/siqroo ───────────────────────────────────────────────

/**
 * Completa los datos SIQROO pendientes (número de control interno y/o boleta),
 * que no se tienen al momento del ingreso. Se llama desde el detalle del oficio.
 */
export async function completarSiqroo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const oficio_id = parseInt(req.params.id, 10);

    const oficio = await db('oficios').where({ id: oficio_id }).first();
    if (!oficio) throw new AppError('Oficio no encontrado', 404);
    if (!oficio.siqroo_aplica) {
      throw new AppError('Este oficio no está marcado como ingresado a SIQROO', 422);
    }

    const control = String(req.body?.control_interno ?? '').trim();
    const boleta  = (req as any).file as Express.Multer.File | undefined;

    if (!control && !boleta) {
      throw new AppError('Indica el número de control interno o adjunta la boleta', 422);
    }

    const update: Record<string, unknown> = {};
    if (control) update.siqroo_control_interno = control;
    if (boleta) {
      const r = await storage.saveWithInfo(boleta, 'oficios/siqroo', {
        filename: `${oficio_id}_boleta_${Date.now()}`,
      });
      update.siqroo_boleta_url = r.url;
    }

    await db('oficios').where({ id: oficio_id }).update(update);
    const actualizado = await db('oficios').where({ id: oficio_id }).first();

    res.json({ data: actualizado, message: 'Datos SIQROO actualizados' });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /oficios/:id/reasignar ────────────────────────────────────────────

/**
 * El encargado reasigna un oficio a otro abogado del área jurídica.
 *
 * Roles permitidos: ENCARGADO
 * Body: { abogado_id: number, motivo?: string }
 *
 * Acciones:
 *  - Marca la asignación anterior como inactiva (activa = false)
 *  - Crea una nueva asignación activa
 *  - Regresa el estatus a ASIGNADO
 *  - Crea registro de auditoría
 */
export async function reasignarOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    if (!(await canActAsEncargado(user))) {
      throw new AppError('Solo el ENCARGADO puede reasignar oficios', 403);
    }
    const oficio_id = parseInt(req.params.id, 10);
    const { abogado_id, motivo } = req.body;

    if (!abogado_id) {
      throw new AppError('abogado_id es requerido', 400);
    }

    // Verificar que el nuevo abogado existe y está activo (sin restricción de rol)
    const abogado = await db('usuarios').where({ id: abogado_id, activo: true }).first();
    if (!abogado) {
      throw new AppError('El abogado indicado no existe o está inactivo', 404);
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      const estatusPermitidos: EstatusOficio[] = [
        'ASIGNADO', 'EN_REVISION', 'EN_RECONSIDERACION',
      ];
      if (!estatusPermitidos.includes(oficio.estatus)) {
        throw new AppError(
          `No se puede reasignar un oficio con estatus ${oficio.estatus}`,
          422,
        );
      }

      // Verificar que no se reasigna al mismo abogado
      const asignacionActual = await trx('asignaciones_juridicas')
        .where({ oficio_id })
        .orderBy('id', 'desc')
        .first();

      if (asignacionActual && asignacionActual.abogado_id === Number(abogado_id)) {
        throw new AppError('El oficio ya está asignado a ese abogado', 422);
      }

      // Crear nueva asignación (sin columna activa)
      await trx('asignaciones_juridicas').insert({
        oficio_id,
        abogado_id,
        asignado_por_id:  user.id,
        fecha_asignacion: new Date(),
        observaciones:    motivo ?? null,
      });

      // Regresar estatus a ASIGNADO
      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'ASIGNADO' as EstatusOficio });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'ASIGNADO', user.id);
    });

    res.json({ message: 'Oficio reasignado correctamente' });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /oficios/:id/asignar ──────────────────────────────────────────────

/**
 * El encargado asigna el oficio a un abogado del área jurídica.
 *
 * Roles permitidos: ENCARGADO
 * Body: { abogado_id: number, observaciones?: string }
 *
 * Acciones:
 *  - Actualiza estatus → ASIGNADO
 *  - Crea registro en asignaciones_juridicas
 *  - Crea registro de auditoría
 */
export async function asignarOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    if (!(await canActAsEncargado(user))) {
      throw new AppError('Solo el ENCARGADO puede asignar oficios', 403);
    }

    const oficio_id    = parseInt(req.params.id, 10);
    const { abogado_id, observaciones } = req.body;

    if (!abogado_id) {
      throw new AppError('abogado_id es requerido', 400);
    }

    // Verificar que el abogado existe y está activo (sin restricción de rol)
    const abogado = await db('usuarios').where({ id: abogado_id, activo: true }).first();
    if (!abogado) {
      throw new AppError('El abogado indicado no existe o está inactivo', 404);
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'ASIGNADO' as EstatusOficio });

      await trx('asignaciones_juridicas').insert({
        oficio_id,
        abogado_id,
        asignado_por_id:  user.id,
        fecha_asignacion: new Date(),
        observaciones:    observaciones ?? null,
      });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'ASIGNADO', user.id);
    });

    res.json({ message: 'Oficio asignado correctamente' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /oficios/:id/subir-proyecto ────────────────────────────────────────

/**
 * El abogado sube su borrador de contestación (Word o PDF).
 *
 * Roles permitidos: JURIDICO
 * Body: multipart/form-data con campo "file"
 *
 * Acciones:
 *  - Guarda el archivo en storage
 *  - Crea / actualiza registro en gestiones_contestacion
 *  - Actualiza estatus → EN_REVISION
 *  - Crea registro de auditoría
 */
export async function subirProyecto(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    if (!req.file) {
      throw new AppError('El archivo del proyecto es obligatorio', 400);
    }

    const oficio_id = parseInt(req.params.id, 10);

    // El ENCARGADO de este oficio (según su "dirigido a") puede trabajarlo él mismo,
    // sin auto-asignarse: sube el proyecto directo. Los demás deben ser del área
    // jurídica y tener una asignación.
    const oficioRow = await db('oficios').where({ id: oficio_id }).select('dirigido_a_id').first();
    if (!oficioRow) throw new AppError('Oficio no encontrado', 404);
    const encargadoDeEsteOficio = await resolverEncargadoDeOficio(oficioRow.dirigido_a_id);
    const esEncargadoDirecto = encargadoDeEsteOficio === user.id;

    if (!esEncargadoDirecto && user.rol !== 'JURIDICO' && user.rol !== 'OPERATIVO' && user.rol !== 'OFICIAL') {
      throw new AppError('Solo el área jurídica puede subir proyectos', 403);
    }

    if (!esEncargadoDirecto) {
      const asignacion = await db('asignaciones_juridicas')
        .where({ oficio_id, abogado_id: user.id })
        .orderBy('id', 'desc')
        .first();

      if (!asignacion) {
        throw new AppError('No tienes una asignación para este oficio', 403);
      }
    }

    const guardadoProyecto = await storage.saveWithInfo(req.file, 'oficios/proyectos');
    const proyecto_url = guardadoProyecto.url;

    // ── Extraer texto del Word con mammoth ────────────────────
    let texto_proyecto: string | null = null;
    const isWord = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ].includes(req.file.mimetype);

    if (isWord) {
      try {
        const mammoth = await import('mammoth');
        const result  = await mammoth.extractRawText({ buffer: req.file.buffer });
        texto_proyecto = result.value?.trim() ?? null;
        logger.info({ oficio_id, chars: texto_proyecto?.length }, 'Word text extracted');
      } catch (err: any) {
        logger.warn({ err: err.message, oficio_id }, 'mammoth extraction failed');
      }
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      // Calcular versión del proyecto
      const gestionExistente = await trx('gestiones_contestacion')
        .where({ oficio_id }).first();
      const version = gestionExistente ? (gestionExistente.version_proyecto ?? 1) + 1 : 1;

      if (gestionExistente) {
        await trx('gestiones_contestacion')
          .where({ oficio_id })
          .update({ proyecto_url, texto_proyecto, version_proyecto: version, vobo_encargado: false });
      } else {
        await trx('gestiones_contestacion').insert({
          oficio_id, proyecto_url, texto_proyecto,
          version_proyecto: version, vobo_encargado: false,
        });
      }

      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'EN_REVISION' as EstatusOficio });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'EN_REVISION', user.id);
    });

    res.json({ message: 'Proyecto subido correctamente', compresion: compresionInfo(guardadoProyecto) });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /oficios/:id/reconsiderar ─────────────────────────────────────────

/**
 * El encargado rechaza el borrador y solicita correcciones.
 *
 * Roles permitidos: ENCARGADO
 * Body: { comentario: string }
 *
 * Acciones:
 *  - Guarda comentario en comentarios_reconsideracion
 *  - Actualiza estatus → EN_RECONSIDERACION
 *  - Crea registro de auditoría
 */
export async function reconsiderarOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const oficio_id  = parseInt(req.params.id, 10);
    const { comentario } = req.body;

    // En delegaciones lo decide el delegado; en la DG, el encargado (misma regla que el VoBo).
    const oficioAuth = await db('oficios').where({ id: oficio_id }).select('dirigido_a_id').first();
    if (!oficioAuth) throw new AppError('Oficio no encontrado', 404);
    if (!(await puedeAprobarOficio(user, oficioAuth.dirigido_a_id))) {
      throw new AppError('No estás autorizado para solicitar correcciones de este oficio', 403);
    }

    if (!comentario?.trim()) {
      throw new AppError('El comentario de corrección es obligatorio', 400);
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      if (!['EN_REVISION', 'EN_RECONSIDERACION'].includes(oficio.estatus)) {
        throw new AppError(
          `El oficio debe estar EN_REVISION para solicitar reconsideración (estatus: ${oficio.estatus})`,
          422,
        );
      }

      // Obtener versión actual del proyecto
      const gestion = await trx('gestiones_contestacion').where({ oficio_id }).first();
      const version = gestion?.version_proyecto ?? 1;

      await trx('comentarios_reconsideracion').insert({
        oficio_id,
        encargado_id: user.id,
        comentario:   comentario.trim(),
        fecha:        new Date(),
        version,
        resuelto:     false,
      });

      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'EN_RECONSIDERACION' as EstatusOficio });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'EN_RECONSIDERACION', user.id);
    });

    res.json({ message: 'Reconsideración solicitada. El jurídico recibirá los comentarios.' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /oficios/:id/comentarios ─────────────────────────────────────────────

/**
 * Obtiene los comentarios de reconsideración de un oficio.
 * Roles: ENCARGADO, JURIDICO, DIRECTOR
 */
export async function getComentarios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const oficio_id = parseInt(req.params.id, 10);

    const comentarios = await db('comentarios_reconsideracion as cr')
      .join('usuarios as u', 'u.id', 'cr.encargado_id')
      .where('cr.oficio_id', oficio_id)
      .select(
        'cr.id', 'cr.comentario', 'cr.fecha',
        'cr.version', 'cr.resuelto',
        'u.nombre as encargado_nombre',
      )
      .orderBy('cr.fecha', 'asc');

    res.json({ data: comentarios });
  } catch (err) {
    next(err);
  }
}

// ─── GET /oficios/:id/historial ──────────────────────────────────────────────

/**
 * Historial de movimientos (auditoría de estados) de un oficio, para la línea
 * temporal: cada cambio de estado con quién lo hizo y cuándo.
 */
export async function getHistorial(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const oficio_id = parseInt(req.params.id, 10);

    const historial = await db('auditoria_estados as a')
      .join('usuarios as u', 'u.id', 'a.usuario_id')
      .where('a.oficio_id', oficio_id)
      .select(
        'a.id', 'a.estado_anterior', 'a.estado_nuevo', 'a.fecha_cambio',
        'u.nombre as usuario_nombre',
      )
      .orderBy('a.fecha_cambio', 'asc');

    res.json({ data: historial });
  } catch (err) {
    next(err);
  }
}

// ─── GET /oficios/:id/documentos ─────────────────────────────────────────────

/**
 * Lista los documentos categorizados adjuntos al oficio (para ver/descargar).
 * Roles: cualquiera con acceso al módulo (ruta ya autenticada).
 */
export async function getDocumentos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const oficio_id = parseInt(req.params.id, 10);

    const documentos = await db('oficio_documentos as d')
      .leftJoin('usuarios as u', 'u.id', 'd.subido_por_id')
      .where('d.oficio_id', oficio_id)
      .select(
        'd.id', 'd.tipo', 'd.archivo_url', 'd.nombre_original', 'd.subido_en',
        'u.nombre as subido_por_nombre',
      )
      .orderBy('d.id', 'asc');

    res.json({ data: documentos });
  } catch (err) {
    next(err);
  }
}

// ─── GET /oficios/candidatos-asignacion ──────────────────────────────────────

/**
 * Usuarios de la unidad del encargado que tienen habilitado el módulo de oficios.
 * Son los candidatos a quienes el encargado puede asignar/reasignar un oficio
 * (jurídicos de su misma delegación).
 */
export async function getCandidatosAsignacion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const candidatos = await db('usuarios as u')
      .join('usuario_modulos as um', 'um.usuario_id', 'u.id')
      .join('modulos as m', 'm.id', 'um.modulo_id')
      .where('u.unidad_id', user.oficina_id)
      .andWhere('u.activo', true)
      .andWhere('m.clave', 'oficialia_partes')
      .andWhereNot('u.id', user.id)
      .distinct('u.id', 'u.nombre', 'u.cargo', 'u.email')
      .orderBy('u.nombre', 'asc');
    res.json({ data: candidatos });
  } catch (err) { next(err); }
}

// ─── PATCH /oficios/:id/vobo ─────────────────────────────────────────────────

/**
 * El encargado aprueba el borrador (Visto Bueno).
 *
 * Roles permitidos: ENCARGADO
 *
 * Acciones:
 *  - Actualiza gestiones_contestacion: vobo_encargado = true, fecha_vobo = now
 *  - Actualiza estatus → VOBO_APROBADO
 *  - Crea registro de auditoría
 *  - Notifica a secretaría
 */
export async function aprobarVobo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const oficio_id = parseInt(req.params.id, 10);

    // En delegaciones el VoBo lo da el delegado; en la DG, el encargado.
    const oficioAuth = await db('oficios').where({ id: oficio_id }).select('dirigido_a_id').first();
    if (!oficioAuth) throw new AppError('Oficio no encontrado', 404);
    if (!(await puedeAprobarOficio(user, oficioAuth.dirigido_a_id))) {
      throw new AppError('No estás autorizado para otorgar el VoBo de este oficio', 403);
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      if (!['EN_REVISION', 'EN_RECONSIDERACION'].includes(oficio.estatus)) {
        throw new AppError(
          `El oficio debe estar EN_REVISION o EN_RECONSIDERACION para otorgar VoBo (estatus actual: ${oficio.estatus})`,
          422,
        );
      }

      const gestion = await trx('gestiones_contestacion')
        .where({ oficio_id })
        .first();

      if (!gestion) {
        throw new AppError('No existe un proyecto de contestación para este oficio', 422);
      }

      const fecha_vobo = new Date();

      await trx('gestiones_contestacion')
        .where({ oficio_id })
        .update({ vobo_encargado: true, fecha_vobo });

      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'VOBO_APROBADO' as EstatusOficio });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'VOBO_APROBADO', user.id);
    });

    // Notificar a secretaría fuera de la transacción (no crítico)
    const oficioParaNotif = await db('oficios')
      .where({ id: oficio_id })
      .select('id', 'folio', 'dependencia_origen')
      .first();

    if (oficioParaNotif) {
      await notifyVoboAprobado(oficioParaNotif).catch((err) =>
        logger.error({ err, oficio_id }, 'Error al notificar VoBo a secretaría'),
      );
    }

    res.json({ message: 'VoBo otorgado correctamente' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /oficios/:id/finalizar ─────────────────────────────────────────────

/**
 * Secretaría sube el documento escaneado y firmado, cerrando el flujo.
 *
 * Roles permitidos: SECRETARIA
 * Body: multipart/form-data con campo "file"
 *
 * Acciones:
 *  - Guarda el PDF firmado en storage
 *  - Actualiza gestiones_contestacion: escaneo_firmado_url, subido_por_secretaria_id
 *  - Actualiza estatus → FINALIZADO
 *  - Crea registro de auditoría
 */
export async function finalizarOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const oficio_id = parseInt(req.params.id, 10);

    // Autorización: SECRETARIA (Dirección General) o el delegado/encargado (delegaciones).
    const oficioAuth = await db('oficios').where({ id: oficio_id }).select('dirigido_a_id').first();
    if (!oficioAuth) throw new AppError('Oficio no encontrado', 404);
    if (!(await puedeSubirFirmado(user, oficioAuth.dirigido_a_id))) {
      throw new AppError('No autorizado para subir el documento firmado', 403);
    }

    if (!req.file) {
      throw new AppError('El archivo escaneado y firmado es obligatorio', 400);
    }

    const guardadoFirmado = await storage.saveWithInfo(req.file, 'oficios/firmados');
    const escaneo_firmado_url = guardadoFirmado.url;

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      if (oficio.estatus !== 'VOBO_APROBADO') {
        throw new AppError(
          `El oficio debe tener VoBo aprobado para finalizar (estatus actual: ${oficio.estatus})`,
          422,
        );
      }

      await trx('gestiones_contestacion')
        .where({ oficio_id })
        .update({
          escaneo_firmado_url,
          subido_por_secretaria_id: user.id,
        });

      await trx('oficios')
        .where({ id: oficio_id })
        .update({ estatus: 'FINALIZADO' as EstatusOficio });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'FINALIZADO', user.id);
    });

    res.json({ message: 'Oficio finalizado correctamente', compresion: compresionInfo(guardadoFirmado) });
  } catch (err) {
    next(err);
  }
}
