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
import { tieneDelegatoriosPendientes } from './delegatorios.controller';
import { buscarDuplicados, hashArchivo } from './duplicados';
import { sumarDiasHabiles, aFechaSql } from '../../utils/dias-habiles';
import { notifyDelegatorio } from '../../notifications/notification.dispatcher';

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
 * ¿Este usuario pertenece a la Dirección Jurídica?
 *
 * Vale tanto para su gente operativa (su unidad ES la Dirección Jurídica) como
 * para su encargado configurado, que puede estar adscrito a otra unidad — es el
 * caso de Óscar Gopar, encargado de Jurídica y de la Dirección General a la vez.
 *
 * La unidad se identifica por nombre y no por id, para que siga funcionando si
 * el catálogo se reorganiza.
 */
export async function esDeJuridica(user: any): Promise<boolean> {
  const juridica = await db('catalogo_unidades')
    .where('tipo', 'DIRECCION')
    .andWhere('activo', true)
    .whereRaw("translate(lower(nombre),'áéíóú','aeiou') LIKE '%juridic%'")
    .select('id')
    .first();
  if (!juridica) return false;

  if (user.unidad_id === juridica.id || user.oficina_id === juridica.id) return true;

  const encargado = await db('configuracion_flujos')
    .where({
      modulo_clave: 'oficialia_partes',
      rol_flujo:    'ENCARGADO',
      unidad_id:    juridica.id,
      usuario_id:   user.id,
    })
    .first();
  return !!encargado;
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
 * ¿Este oficio está esperando la firma de la Dirección General?
 *
 * Mientras lo esté, el oficio sigue dirigido a quien siempre estuvo —el destinatario
 * es un dato del documento y no se reescribe—, pero quien lo cierra es la secretaría
 * de la Dirección General y no el área.
 */
async function enPaseFirma(oficio_id: number, trx: any = db): Promise<boolean> {
  const row = await trx('oficio_pases_firma')
    .where({ oficio_id })
    .whereNull('cerrado_en')
    .first();
  return !!row;
}

/**
 * ¿Puede este usuario subir el documento firmado y finalizar el oficio?
 *
 * Si el oficio está en pase de firma, lo cierra la secretaría de la Dirección
 * General, sin importar de qué área venga. Si no, en delegaciones y direcciones de
 * área lo puede hacer TANTO el titular como el ENCARGADO de esa unidad (el primero
 * que lo suba finaliza; el otro ya no puede porque el oficio deja de estar en
 * VOBO_APROBADO). En la Dirección General lo hace la SECRETARIA.
 */
async function puedeSubirFirmado(user: any, dirigidoAId: number | null, oficio_id?: number): Promise<boolean> {
  if (oficio_id && await enPaseFirma(oficio_id)) return canActAsSecretaria(user);

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
    // Dirección General: firma su encargado, que es quien dio el visto bueno. Antes
    // el oficio pasaba solo a la secretaría al aprobarse; ahora se queda con él, que
    // decide si lo firma o lo manda a firma de la Directora General.
    const encargadoId = await resolverEncargadoDeOficio(dirigidoAId);
    if (encargadoId === user.id) return true;
  }
  return canActAsSecretaria(user);   // sin encargado resuelto: la secretaría, como antes
}

/**
 * ¿Puede este usuario mandar el oficio a firma de la Dirección General?
 *
 * Lo deciden los dos que responden por el contenido: quien dio el visto bueno y el
 * encargado del área. Aplica en todas las áreas del módulo, la Dirección General
 * incluida: ahí su encargado también se queda con el oficio al aprobarlo y decide
 * si lo firma o si lo pasa a la firma de la Directora General.
 */
async function puedeMandarAPaseFirma(user: any, dirigidoAId: number | null): Promise<boolean> {
  if (!dirigidoAId) return false;
  if (await puedeAprobarOficio(user, dirigidoAId)) return true;
  const encargadoId = await resolverEncargadoDeOficio(dirigidoAId);
  return encargadoId === user.id;
}

/** La unidad de la Dirección General y su titular, para dirigir los avisos. */
async function direccionGeneral(): Promise<{ unidad_id: number; titular_id: number | null } | null> {
  const unidad = await db('catalogo_unidades')
    .where({ tipo: 'DIRECCION_GENERAL', activo: true })
    .select('id')
    .first();
  if (!unidad) return null;
  const titular = await db('usuarios')
    .where({ unidad_id: unidad.id, rol: 'DIRECTOR', activo: true })
    .select('id')
    .first();
  return { unidad_id: unidad.id, titular_id: titular?.id ?? null };
}

/**
 * A quién se avisa cuando un oficio cae en la Dirección General esperando firma.
 *
 * La secretaría se resuelve de la configuración de flujos y no del nombre de la
 * unidad: el SuperAdmin puede cambiar quién ocupa ese puesto y el aviso debe seguirlo.
 * Se suman la titular y quienes la acompañan en su oficina.
 */
async function destinatariosPaseFirma(): Promise<number[]> {
  const dg = await direccionGeneral();
  if (!dg) return [];

  const secretarias = await db('configuracion_flujos')
    .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'SECRETARIA' })
    .pluck('usuario_id');

  const acompanan = await db('usuarios')
    .where({ unidad_id: dg.unidad_id, activo: true })
    .whereIn('rol', ['DIRECTOR', 'PARTICULAR'])
    .pluck('id');

  return [...new Set([...secretarias, ...acompanan, dg.titular_id].filter(Boolean) as number[])];
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
        // Delegatorios sin contestar de este oficio: bloquean VoBo y firma.
        db.raw(`(SELECT count(*) FROM oficio_delegatorios d
                  WHERE d.oficio_id = oficios.id
                    AND d.estado IN ('PENDIENTE','ASIGNADO','EN_REVISION'))::int
                AS delegatorios_pendientes`),
        // ¿Llegó por un turno? Solo entonces se puede devolver a quien lo mandó.
        db.raw(`(SELECT count(*) FROM oficio_turnos t
                  WHERE t.oficio_id = oficios.id
                    AND t.unidad_destino_id = dir_u.unidad_id)::int
                AS turnos_recibidos`),
        // ¿El último movimiento que lo trajo fue una devolución? Cambia la etiqueta.
        // Marcado en SIGER sin delegatorio a una delegación: no puede cerrarse.
        db.raw(`(oficios.siger_aplica AND NOT EXISTS (
                   SELECT 1 FROM oficio_delegatorios d
                   JOIN catalogo_unidades dcu ON dcu.id = d.unidad_destino_id
                   WHERE d.oficio_id = oficios.id
                     AND dcu.tipo = 'DELEGACION'
                     AND d.estado <> 'RECHAZADO'))
                AS siger_sin_delegatorio`),
        // FRE marcado sin delegatorio a la Dirección de Informática.
        db.raw(`(oficios.fre_incorporado AND NOT EXISTS (
                   SELECT 1 FROM oficio_delegatorios d
                   JOIN catalogo_unidades dcu ON dcu.id = d.unidad_destino_id
                   WHERE d.oficio_id = oficios.id
                     AND dcu.tipo = 'DIRECCION'
                     AND translate(lower(dcu.nombre),'áéíóú','aeiou') LIKE '%informat%'
                     AND d.estado <> 'RECHAZADO'))
                AS fre_sin_delegatorio`),
        // Testamento marcado sin delegatorio a ninguna delegación.
        db.raw(`(oficios.testamento AND NOT EXISTS (
                   SELECT 1 FROM oficio_delegatorios d
                   JOIN catalogo_unidades dcu ON dcu.id = d.unidad_destino_id
                   WHERE d.oficio_id = oficios.id
                     AND dcu.tipo = 'DELEGACION'
                     AND d.estado <> 'RECHAZADO'))
                AS testamento_sin_delegatorio`),
        db.raw(`(SELECT t.es_devolucion FROM oficio_turnos t
                  WHERE t.oficio_id = oficios.id
                    AND t.unidad_destino_id = dir_u.unidad_id
                  ORDER BY t.id DESC LIMIT 1)
                AS llego_por_devolucion`),
        // Esperando la firma de la Dirección General: no cambia de área, pero sí
        // cambia quién lo cierra y en qué bandeja se muestra.
        db.raw(`EXISTS (SELECT 1 FROM oficio_pases_firma pf
                         WHERE pf.oficio_id = oficios.id
                           AND pf.cerrado_en IS NULL)
                AS en_pase_firma`),
        // Y si la Dirección General lo regresó, el área necesita leer por qué.
        db.raw(`(SELECT pf.motivo_cierre FROM oficio_pases_firma pf
                  WHERE pf.oficio_id = oficios.id
                    AND pf.resultado = 'CORREGIR'
                  ORDER BY pf.id DESC LIMIT 1)
                AS pase_firma_devuelto_motivo`),
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
           .orWhereILike('oficios.correo_origen', term)
           .orWhereILike('oficios.descripcion_solicitud', term)
           .orWhereILike('oficios.texto_ocr', term)
           .orWhereILike('oficios.siqroo_control_interno', term)
           .orWhereILike('oficios.siger_control_interno', term)
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

    // Filtro «NCI pendiente»: marcado en un sistema pero sin su número de control.
    // Cubre SIQROO y SIGER — basta que falte en cualquiera de los dos.
    if (req.query.siqroo_pendiente === 'true') {
      // Solo SIQROO: SIGER no lleva número de control.
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

    // Solo la Dirección Jurídica marca oficios «de conocimiento».
    const puedeMarcarConocimiento = await esDeJuridica(user);

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
          // Cada área sube su propio firmado —su encargado o su titular—, la
          // Dirección General incluida. Solo lo que se mandó a firma cae con la
          // secretaría, que es quien recaba la firma de la Directora General.
          en_bandeja_de = (o as any).en_pase_firma ? secretariaNombre : o.encargado_nombre;
          break;
        default:
          en_bandeja_de = o.encargado_nombre;
      }

      // Delegatorios sin contestar: bloquean VoBo y firma, y la interfaz lo explica.
      const delegatorios_pendientes = Number((o as any).delegatorios_pendientes ?? 0);

      // ¿Puede el usuario actual dar el VoBo?
      const sigerPendiente = !!(o as any).siger_sin_delegatorio
        || !!(o as any).fre_sin_delegatorio
        || !!(o as any).testamento_sin_delegatorio;
      const puede_vobo = delegatorios_pendientes === 0 && !sigerPendiente && (voboLoDaElEncargado
        ? unidadesEncargado.includes(o.dirigido_a_unidad_id)   // el encargado de esa unidad
        : o.dirigido_a_id === user.id);                         // el titular (dirigido a)

      // Responsable del visto bueno (nombre).
      const vobo_por_nombre = aprobadorNombre;

      // ¿Puede el usuario actual subir el firmado / finalizar este oficio?
      // En pase de firma lo cierra la secretaría, venga de donde venga. Si no, lo
      // cierra su propia área —el titular o el encargado—, y eso vale también para
      // la Dirección General: su encargado se queda con el oficio al aprobarlo.
      const enPase = !!(o as any).en_pase_firma;
      const puede_finalizar = delegatorios_pendientes === 0 && !sigerPendiente && (enPase
        ? esSecretaria
        : (o.dirigido_a_id === user.id || unidadesEncargado.includes(o.dirigido_a_unidad_id)));

      // Mandarlo a firma de la Dirección General: quien dio el visto bueno y el
      // encargado del área, en todas las áreas del módulo.
      const puede_mandar_firma = o.estatus === 'VOBO_APROBADO'
        && !enPase
        && delegatorios_pendientes === 0
        && !sigerPendiente
        && (puede_vobo || unidadesEncargado.includes(o.dirigido_a_unidad_id));

      // Y regresarlo al área sin firmarlo: solo la secretaría, mientras esté a firma.
      const puede_devolver_pase_firma = enPase && esSecretaria;

      // Turnar a otra área: lo hace el encargado del área que hoy tiene el oficio.
      const puede_turnar = o.estatus !== 'FINALIZADO'
        && unidadesEncargado.includes(o.dirigido_a_unidad_id);
      // Y devolverlo, solo si llegó por un turno.
      const puede_devolver_turno = puede_turnar && Number((o as any).turnos_recibidos ?? 0) > 0;

      // La casilla «de conocimiento» solo la ve Jurídica, y solo mientras el
      // oficio no esté cerrado por firma.
      const puede_de_conocimiento = puedeMarcarConocimiento
        && (o.de_conocimiento || o.estatus !== 'FINALIZADO');

      return {
        ...o,
        dias_restantes,
        delegatorios_pendientes,
        puede_vobo,
        puede_finalizar,
        puede_de_conocimiento,
        puede_turnar,
        puede_devolver_turno,
        puede_mandar_firma,
        puede_devolver_pase_firma,
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
/**
 * GET /oficios/verificar-duplicado
 *
 * Lo consulta el formulario mientras se captura, para avisar antes de que el
 * oficial llene todo lo demás. El alta vuelve a verificar por su cuenta: esto
 * es una ayuda de captura, no el control.
 */
export async function verificarDuplicado(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const resultado = await buscarDuplicados({
      dependencia_origen:   req.query.dependencia_origen as string,
      numero_oficio_origen: req.query.numero_oficio_origen as string,
      remitente:            req.query.remitente as string,
      fecha_oficio:         req.query.fecha_oficio as string,
    });
    res.json({ data: resultado });
  } catch (err) {
    next(err);
  }
}

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
      via_recepcion,
      correo_origen,
      correo_destino,
    } = req.body;

    // ── Archivos: 5 documentos (opcionales) + boleta SIQROO (opcional) ──
    // El documento "Oficio" es el principal (se OCR-ea). Ninguno es obligatorio aún.
    const files      = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const oficioFile = files['oficio']?.[0];
    const boletaFile = files['boleta']?.[0];

    // ── Vía de recepción ──────────────────────────────────────
    // Por ventanilla no hay correos que guardar; por correo electrónico ambos
    // son obligatorios, porque son la constancia de por dónde entró el oficio.
    const via = String(via_recepcion ?? 'VENTANILLA').trim().toUpperCase();
    if (!['VENTANILLA', 'CORREO_ELECTRONICO'].includes(via)) {
      throw new AppError('Indica si el oficio se recibió por ventanilla o por correo electrónico', 400);
    }
    const esCorreo   = via === 'CORREO_ELECTRONICO';
    const cOrigen    = esCorreo ? String(correo_origen  ?? '').trim().toLowerCase() : null;
    const cDestino   = esCorreo ? String(correo_destino ?? '').trim().toLowerCase() : null;
    if (esCorreo) {
      if (!cOrigen || !cDestino) {
        throw new AppError('Cuando la recepción es por correo electrónico, captura el correo de quien envía y el que lo recibió', 400);
      }
      const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!formatoCorreo.test(cOrigen) || !formatoCorreo.test(cDestino)) {
        throw new AppError('Alguno de los correos no tiene un formato válido', 400);
      }
    }

    // ── Duplicados ────────────────────────────────────────────
    // Se revisa antes de generar folio y de guardar archivos, para no dejar
    // basura si resulta que el oficio ya estaba capturado.
    const archivo_hash = oficioFile ? hashArchivo(oficioFile.buffer) : null;
    const duplicados = await buscarDuplicados({
      dependencia_origen:   dependencia_origen,
      numero_oficio_origen: numero_oficio_origen,
      remitente:            remitente,
      fecha_oficio:         fecha_oficio,
      archivo_hash,
    });

    if (duplicados.bloqueantes.length) {
      const yaExiste = duplicados.bloqueantes[0];
      throw new AppError(
        `Este oficio ya está registrado con el folio ${yaExiste.folio} (${yaExiste.explicacion.toLowerCase()}).`,
        409,
      );
    }

    // Los parecidos no bloquean, pero sí exigen que el oficial los haya visto.
    const confirmado = req.body?.confirmar_duplicado === true
      || req.body?.confirmar_duplicado === 'true';
    if (duplicados.advertencias.length && !confirmado) {
      const err = new AppError(
        'Hay oficios parecidos ya registrados. Revísalos y confirma si aun así deseas continuar.',
        409,
      );
      (err as any).detalles = { advertencias: duplicados.advertencias };
      throw err;
    }

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
          descripcion_solicitud: mayus(descripcion_solicitud),
          tiene_termino:        Boolean(tiene_termino),
          fecha_vencimiento:    fecha_vencimiento ?? null,
          pdf_original_path,
          // SIQROO y SIGER se marcan después, desde el detalle del oficio.
          siqroo_aplica:        false,
          siger_aplica:         false,
          archivo_hash,
          via_recepcion:        via,
          correo_origen:        cOrigen,
          correo_destino:       cDestino,
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

      // ── Boleta SIQROO ────────────────────────────────────────
      // El alta ya no marca SIQROO, pero si alguien adjunta la boleta se guarda:
      // el registro en los sistemas se completa después desde el detalle.
      if (boletaFile) {
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

// ─── PATCH /oficios/:id/sistemas ─────────────────────────────────────────────

/**
 * Marca en qué sistemas se capturó la solicitud (SIQROO, SIGER, ambos o
 * ninguno) y guarda el NCI de cada uno. Al ingresar el oficio no se sabe
 * todavía, así que esto se hace después, desde el detalle.
 *
 * Cada sistema es independiente: se puede marcar uno sin el otro, y desmarcar
 * uno limpia solo su propio NCI.
 */
export async function actualizarSistemas(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const oficio_id = parseInt(req.params.id, 10);

    const oficio = await db('oficios').where({ id: oficio_id }).first();
    if (!oficio) throw new AppError('Oficio no encontrado', 404);

    const esBool = (v: unknown) => v === true || v === 'true';
    const siqroo = esBool(req.body?.siqroo_aplica);
    const siger  = esBool(req.body?.siger_aplica);

    const nciSiqroo = String(req.body?.siqroo_control_interno ?? '').trim().toUpperCase();

    // SIGER no lleva número de control: solo se marca si la solicitud se capturó
    // ahí. Desmarcar SIQROO borra su NCI, para no dejarlo colgando.
    const update: Record<string, unknown> = {
      siqroo_aplica:          siqroo,
      siger_aplica:           siger,
      siqroo_control_interno: siqroo ? (nciSiqroo || null) : null,
      siger_control_interno:  null,
    };

    // Incorporación del FRE a SIQROO: constancia con fecha. Se conserva la que
    // ya tenía si sigue marcada, para no perder cuándo se hizo realmente.
    if (req.body?.fre_incorporado !== undefined) {
      const fre = esBool(req.body.fre_incorporado);
      update.fre_incorporado    = fre;
      update.fre_incorporado_en = fre ? (oficio.fre_incorporado_en ?? new Date()) : null;
    }

    // La boleta de SIQROO se conserva como estaba; solo se reemplaza si viene una nueva.
    const boleta = (req as any).file as Express.Multer.File | undefined;
    if (boleta) {
      const r = await storage.saveWithInfo(boleta, 'oficios/siqroo', {
        filename: `${oficio_id}_boleta_${Date.now()}`,
      });
      update.siqroo_boleta_url = r.url;
    }

    await db('oficios').where({ id: oficio_id }).update(update);
    const actualizado = await db('oficios').where({ id: oficio_id }).first();

    res.json({ data: actualizado, message: 'Registro en sistemas actualizado' });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /oficios/:id/testamento ───────────────────────────────────────────

/** Plazo de cada etapa, en días hábiles. */
const TESTAMENTO_DIAS_DELEGACIONES = 5;
const TESTAMENTO_DIAS_TOTAL        = 10;

/**
 * Marca el oficio como búsqueda de testamentos y arranca sus plazos.
 *
 * Son dos etapas de 5 días hábiles: primero las delegaciones seleccionadas
 * buscan y entregan, después el encargado arma el proyecto de contestación.
 * Los plazos son FIJOS: si una delegación contesta antes, quien sigue puede
 * adelantarse pero no pierde sus días.
 *
 * La búsqueda se opera con los delegatorios de siempre: al marcarlo se fijan
 * los plazos, y el oficio no se cierra hasta que se delegue a alguna
 * delegación desde «Delegar a otra área». Es el mismo trato que SIGER.
 */
export async function marcarTestamento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user      = req.user!;
    const oficio_id = parseInt(req.params.id, 10);
    const marcar    = req.body?.testamento !== false && req.body?.testamento !== 'false';

    const oficio = await db('oficios').where({ id: oficio_id }).first();
    if (!oficio) throw new AppError('Oficio no encontrado', 404);

    // ── Quitar la marca ──────────────────────────────────────
    if (!marcar) {
      if (!oficio.testamento) throw new AppError('Este oficio no está marcado como testamento', 422);
      await db('oficios').where({ id: oficio_id }).update({
        testamento: false,
        testamento_en: null,
        testamento_vence_delegaciones: null,
        testamento_vence_encargado: null,
      });
      res.json({ message: 'Se quitó la marca de testamento. Los delegatorios creados siguen su curso.' });
      return;
    }

    if (oficio.testamento) throw new AppError('Este oficio ya está marcado como testamento', 422);

    const ahora   = new Date();
    const venceD  = sumarDiasHabiles(ahora, TESTAMENTO_DIAS_DELEGACIONES);
    const venceE  = sumarDiasHabiles(ahora, TESTAMENTO_DIAS_TOTAL);

    await db('oficios').where({ id: oficio_id }).update({
      testamento:                    true,
      testamento_en:                 ahora,
      testamento_vence_delegaciones: aFechaSql(venceD),
      testamento_vence_encargado:    aFechaSql(venceE),
      // Si la autoridad ya había puesto un plazo, se respeta el suyo.
      ...(oficio.tiene_termino ? {} : {
        tiene_termino:     true,
        fecha_vencimiento: aFechaSql(venceE),
      }),
    });

    res.json({
      message: 'Búsqueda de testamentos marcada. Delega el oficio a las delegaciones que la harán.',
      data: {
        testamento_vence_delegaciones: aFechaSql(venceD),
        testamento_vence_encargado:    aFechaSql(venceE),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /oficios/:id/de-conocimiento ──────────────────────────────────────

/**
 * Marca (o desmarca) un oficio como «de conocimiento».
 *
 * Hay oficios que no piden respuesta: solo informan algo a la operación interna.
 * Al marcarlos, el oficio se cierra sin pasar por proyecto, visto bueno ni firma.
 *
 * Solo la Dirección Jurídica —su encargado o su gente— puede hacerlo, y es
 * reversible: al desmarcarlo, el oficio regresa al punto del flujo en el que
 * estaba, porque se guardó su estatus anterior.
 */
export async function marcarDeConocimiento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user      = req.user!;
    const oficio_id = parseInt(req.params.id, 10);

    if (!(await esDeJuridica(user))) {
      throw new AppError('Solo la Dirección Jurídica puede marcar un oficio de conocimiento', 403);
    }

    const marcar = req.body?.de_conocimiento !== false && req.body?.de_conocimiento !== 'false';

    // No se cierra un oficio con delegatorios abiertos: quedarían huérfanos.
    if (marcar && await tieneDelegatoriosPendientes(oficio_id)) {
      throw new AppError('Este oficio tiene delegatorios sin contestar. No se puede cerrar hasta que todas las áreas respondan.', 409);
    }
    if (marcar && await sigerSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio está marcado en SIGER, así que debe delegarse a una delegación antes de cerrarse.', 409);
    }
    if (marcar && await freSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio tiene marcada la incorporación de FRE, así que debe delegarse a la Dirección de Informática antes de cerrarse.', 409);
    }
    if (marcar && await testamentoSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio está marcado como testamento, así que debe delegarse a alguna delegación antes de cerrarse.', 409);
    }

    const actualizado = await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      if (marcar) {
        if (oficio.de_conocimiento) {
          throw new AppError('Este oficio ya está marcado de conocimiento', 422);
        }
        // Un oficio ya finalizado con firma no se convierte en informativo.
        if (oficio.estatus === 'FINALIZADO') {
          throw new AppError('Este oficio ya está finalizado', 422);
        }

        await trx('oficios').where({ id: oficio_id }).update({
          de_conocimiento:             true,
          de_conocimiento_por:         user.id,
          de_conocimiento_en:          new Date(),
          estatus_previo_conocimiento: oficio.estatus,
          estatus:                     'FINALIZADO' as EstatusOficio,
        });
        await createAuditLog(trx, oficio_id, oficio.estatus, 'FINALIZADO', user.id);
      } else {
        if (!oficio.de_conocimiento) {
          throw new AppError('Este oficio no está marcado de conocimiento', 422);
        }
        // Regresa a donde estaba. Si por alguna razón no se guardó, vuelve a RECIBIDO.
        const previo = (oficio.estatus_previo_conocimiento ?? 'RECIBIDO') as EstatusOficio;

        await trx('oficios').where({ id: oficio_id }).update({
          de_conocimiento:             false,
          de_conocimiento_por:         null,
          de_conocimiento_en:          null,
          estatus_previo_conocimiento: null,
          estatus:                     previo,
        });
        await createAuditLog(trx, oficio_id, oficio.estatus, previo, user.id);
      }

      return trx('oficios').where({ id: oficio_id }).first();
    });

    res.json({
      data:    actualizado,
      message: marcar
        ? 'Oficio marcado de conocimiento y cerrado'
        : 'Se quitó la marca de conocimiento; el oficio regresó al flujo',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * ¿El oficio está marcado en SIGER pero todavía no se delegó a ninguna
 * delegación? SIGER es el sistema de las delegaciones: marcarlo implica que
 * alguna de ellas tiene que atenderlo, así que el oficio no se cierra hasta que
 * exista ese delegatorio.
 */
export async function sigerSinDelegatorio(oficioId: number): Promise<boolean> {
  const oficio = await db('oficios').where({ id: oficioId }).select('siger_aplica').first();
  if (!oficio?.siger_aplica) return false;

  const [fila] = await db('oficio_delegatorios as d')
    .join('catalogo_unidades as cu', 'cu.id', 'd.unidad_destino_id')
    .where('d.oficio_id', oficioId)
    .andWhere('cu.tipo', 'DELEGACION')
    .whereNot('d.estado', 'RECHAZADO')
    .count('d.id as n');
  return Number((fila as any)?.n ?? 0) === 0;
}

/**
 * Texto libre del módulo en MAYÚSCULAS.
 *
 * Los oficios se capturan así por convención de la oficialía, y mezclar
 * mayúsculas con minúsculas hacía que el mismo dato se viera distinto según
 * quién lo escribió. No aplica a correos ni a rutas de archivo.
 */
const mayus = (v: unknown): string | null => {
  const t = String(v ?? '').trim();
  return t ? t.toUpperCase() : null;
};

/** La Dirección de Informática, identificada por nombre y no por id. */
export async function unidadInformatica(): Promise<{ id: number; nombre: string } | undefined> {
  return db('catalogo_unidades')
    .where('tipo', 'DIRECCION')
    .andWhere('activo', true)
    .whereRaw("translate(lower(nombre),'áéíóú','aeiou') LIKE '%informat%'")
    .select('id', 'nombre')
    .first();
}

/**
 * ¿Se marcó como testamento pero todavía no se delegó a ninguna delegación?
 * La búsqueda la hacen ellas, así que el oficio no se cierra sin ese paso.
 */
export async function testamentoSinDelegatorio(oficioId: number): Promise<boolean> {
  const oficio = await db('oficios').where({ id: oficioId }).select('testamento').first();
  if (!oficio?.testamento) return false;

  const [fila] = await db('oficio_delegatorios as d')
    .join('catalogo_unidades as cu', 'cu.id', 'd.unidad_destino_id')
    .where('d.oficio_id', oficioId)
    .andWhere('cu.tipo', 'DELEGACION')
    .whereNot('d.estado', 'RECHAZADO')
    .count('d.id as n');
  return Number((fila as any)?.n ?? 0) === 0;
}

/**
 * ¿Se marcó la incorporación del FRE pero el oficio no se ha delegado a la
 * Dirección de Informática? Es quien la realiza, así que el oficio no se cierra
 * hasta que exista ese delegatorio.
 */
export async function freSinDelegatorio(oficioId: number): Promise<boolean> {
  const oficio = await db('oficios').where({ id: oficioId }).select('fre_incorporado').first();
  if (!oficio?.fre_incorporado) return false;

  const informatica = await unidadInformatica();
  if (!informatica) return false;

  const [fila] = await db('oficio_delegatorios')
    .where({ oficio_id: oficioId, unidad_destino_id: informatica.id })
    .whereNot('estado', 'RECHAZADO')
    .count('id as n');
  return Number((fila as any)?.n ?? 0) === 0;
}

// ─── GET /oficios/destinatarios ──────────────────────────────────────────────

/**
 * A quién se le puede dirigir un oficio al registrarlo.
 *
 * Desde una DELEGACIÓN solo tiene sentido dirigir a su propio titular o a la
 * Dirección General: son los oficios que físicamente llegan a esa ventanilla.
 * Ver a los titulares de las otras delegaciones solo se presta a equivocaciones.
 *
 * Desde la Dirección General o desde una dirección de área no se acota: ahí sí
 * llegan oficios dirigidos a cualquiera de las direcciones.
 *
 * Si de todas formas llega a una delegación algo que compete a otra área, se
 * registra y se resuelve turnándolo por competencia.
 */
export async function listarDestinatarios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;

    const query = db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .where('u.activo', true)
      .whereIn('u.rol', ['DIRECTOR', 'ENCARGADO'])
      .select('u.id', 'u.nombre', 'u.cargo', 'u.email', 'cu.nombre as oficina_nombre')
      .orderBy('cu.nombre', 'asc')
      .orderBy('u.nombre', 'asc');

    // El tipo se lee de la base y no del token: los tokens emitidos antes de que
    // existiera `unidad_tipo` no lo traen.
    const propia = await db('catalogo_unidades')
      .where('id', user.unidad_id ?? user.oficina_id ?? 0)
      .select('id', 'tipo', 'recibe_direcciones_area')
      .first();

    if (propia?.tipo === 'DELEGACION') {
      // Siempre: su propio titular y la Dirección General.
      const dg = await db('catalogo_unidades')
        .where({ tipo: 'DIRECCION_GENERAL', activo: true })
        .select('id')
        .first();
      const permitidas: number[] = [propia.id, dg?.id].filter(Boolean) as number[];

      // Y, si comparte sede con ellas, también las direcciones de área.
      if (propia.recibe_direcciones_area) {
        const direcciones = await db('catalogo_unidades')
          .where({ tipo: 'DIRECCION', activo: true })
          .pluck('id');
        permitidas.push(...direcciones);
      }

      query.whereIn('u.unidad_id', permitidas);
    }

    res.json({ data: await query });
  } catch (err) {
    next(err);
  }
}

// ─── Turnar el oficio a otra área ────────────────────────────────────────────

/** Unidades a las que se puede turnar un oficio: cualquiera activa con titular. */
export async function areasTurno(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const areas = await db('catalogo_unidades as cu')
      .join('usuarios as u', function () {
        this.on('u.unidad_id', 'cu.id').andOn(db.raw("u.rol = 'DIRECTOR'")).andOn(db.raw('u.activo'));
      })
      .where('cu.activo', true)
      .select('cu.id', 'cu.nombre', 'cu.tipo', 'u.nombre as titular')
      .orderBy('cu.tipo', 'asc')
      .orderBy('cu.nombre', 'asc');
    res.json({ data: areas });
  } catch (err) { next(err); }
}

/**
 * PATCH /oficios/:id/turnar
 *
 * El oficio cambia de área: deja de estar dirigido al titular actual y pasa al
 * de la unidad destino, reiniciando el flujo ahí. Lo hace el encargado del área
 * que lo tiene, cuando lo solicitado no es de su competencia.
 *
 * El folio se conserva —es el del acuse ya entregado— y el recorrido queda en
 * `oficio_turnos` para saber por dónde pasó.
 */
export async function turnarOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user      = req.user!;
    const oficio_id = parseInt(req.params.id, 10);

    const destinoId = Number(req.body?.unidad_destino_id);
    const motivo    = String(req.body?.motivo ?? '').trim().toUpperCase();
    if (!destinoId) throw new AppError('Selecciona el área a la que se turna', 422);
    if (!motivo)    throw new AppError('Indica por qué se turna a esa área', 422);

    // Unidad actual del oficio (la del destinatario) y quién la tiene a cargo.
    const actual = await db('oficios as o')
      .leftJoin('usuarios as u', 'u.id', 'o.dirigido_a_id')
      .where('o.id', oficio_id)
      .select('o.id', 'o.estatus', 'o.dirigido_a_id', 'u.unidad_id as unidad_actual')
      .first();
    if (!actual) throw new AppError('Oficio no encontrado', 404);

    if (actual.estatus === 'FINALIZADO') {
      throw new AppError('Este oficio ya está finalizado; no se puede turnar', 422);
    }
    if (actual.unidad_actual === destinoId) {
      throw new AppError('El oficio ya está en esa área', 422);
    }

    // Solo el encargado del área que hoy tiene el oficio puede turnarlo.
    const esEncargado = await db('configuracion_flujos')
      .where({
        modulo_clave: 'oficialia_partes',
        rol_flujo:    'ENCARGADO',
        usuario_id:   user.id,
        unidad_id:    actual.unidad_actual ?? -1,
      })
      .first();
    if (!esEncargado) {
      throw new AppError('Solo el encargado del área que tiene el oficio puede turnarlo', 403);
    }

    // Con delegatorios abiertos el turno dejaría a otras áreas trabajando de más.
    if (await tieneDelegatoriosPendientes(oficio_id)) {
      throw new AppError('Este oficio tiene delegatorios sin contestar. Resuélvelos antes de turnarlo a otra área.', 409);
    }

    // El oficio queda dirigido al titular del área destino.
    const destino = await db('catalogo_unidades').where({ id: destinoId, activo: true }).first();
    if (!destino) throw new AppError('El área destino no existe o está inactiva', 422);

    const titular = await db('usuarios')
      .where({ unidad_id: destinoId, rol: 'DIRECTOR', activo: true })
      .orderBy('id', 'asc')
      .first();
    if (!titular) {
      throw new AppError(`«${destino.nombre}» no tiene un titular activo al cual dirigir el oficio`, 422);
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      await trx('oficio_turnos').insert({
        oficio_id,
        unidad_origen_id:     actual.unidad_actual ?? null,
        unidad_destino_id:    destinoId,
        dirigido_anterior_id: actual.dirigido_a_id ?? null,
        dirigido_nuevo_id:    titular.id,
        estatus_previo:       oficio.estatus,
        motivo,
        turnado_por_id:       user.id,
        creado_en:            new Date(),
      });

      // El flujo arranca de cero en la nueva área.
      await trx('oficios').where({ id: oficio_id }).update({
        dirigido_a_id: titular.id,
        estatus:       'RECIBIDO' as EstatusOficio,
      });

      // Solo se registra el cambio de estatus si realmente cambió: el turno ya
      // aparece en la línea de tiempo y un «RECIBIDO → RECIBIDO» no aporta nada.
      if (oficio.estatus !== 'RECIBIDO') {
        await createAuditLog(trx, oficio_id, oficio.estatus, 'RECIBIDO', user.id);
      }
    });

    // Aviso al encargado del área que ahora lo recibe. Si falla el correo, el
    // turno ya quedó hecho y no se revierte.
    const encargadosDestino = await db('configuracion_flujos')
      .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'ENCARGADO', unidad_id: destinoId })
      .whereNotNull('usuario_id')
      .pluck('usuario_id');
    const datosOficio = await db('oficios').where({ id: oficio_id })
      .select('folio', 'dependencia_origen').first();
    notifyDelegatorio({
      event:              'OFICIO_TURNADO',
      usuarioIds:         [...encargadosDestino, titular.id],
      oficio_id,
      folio:              datosOficio?.folio ?? '',
      dependencia_origen: datosOficio?.dependencia_origen ?? undefined,
      area:               destino.nombre,
      nota:               motivo,
    }).catch((err) => logger.error({ err, oficio_id }, 'Notificación de turno falló'));

    res.json({ message: `Oficio turnado a ${destino.nombre}` });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /oficios/:id/turnar/devolver
 *
 * El área que recibió un oficio turnado lo regresa a quien se lo mandó, porque
 * el asunto no le compete. Es el movimiento inverso del turno: el oficio vuelve
 * al destinatario anterior y arranca de nuevo allá, con la justificación en la
 * línea de tiempo.
 */
export async function devolverTurno(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user      = req.user!;
    const oficio_id = parseInt(req.params.id, 10);

    const motivo = String(req.body?.motivo ?? '').trim().toUpperCase();
    if (!motivo) throw new AppError('Indica por qué se devuelve el oficio', 422);

    const actual = await db('oficios as o')
      .leftJoin('usuarios as u', 'u.id', 'o.dirigido_a_id')
      .where('o.id', oficio_id)
      .select('o.id', 'o.estatus', 'o.dirigido_a_id', 'u.unidad_id as unidad_actual')
      .first();
    if (!actual) throw new AppError('Oficio no encontrado', 404);

    if (actual.estatus === 'FINALIZADO') {
      throw new AppError('Este oficio ya está finalizado; no se puede devolver', 422);
    }

    const esEncargado = await db('configuracion_flujos')
      .where({
        modulo_clave: 'oficialia_partes',
        rol_flujo:    'ENCARGADO',
        usuario_id:   user.id,
        unidad_id:    actual.unidad_actual ?? -1,
      })
      .first();
    if (!esEncargado) {
      throw new AppError('Solo el encargado del área que tiene el oficio puede devolverlo', 403);
    }

    if (await tieneDelegatoriosPendientes(oficio_id)) {
      throw new AppError('Este oficio tiene delegatorios sin contestar. Resuélvelos antes de devolverlo.', 409);
    }

    // El turno que lo trajo hasta aquí: de ahí salen el área y la persona de regreso.
    const ultimo = await db('oficio_turnos')
      .where({ oficio_id, unidad_destino_id: actual.unidad_actual ?? -1 })
      .orderBy('id', 'desc')
      .first();
    if (!ultimo) {
      throw new AppError('Este oficio no llegó por un turno, así que no hay a quién devolverlo', 422);
    }
    if (!ultimo.dirigido_anterior_id) {
      throw new AppError('No se puede determinar a quién regresar el oficio', 422);
    }

    const destino = await db('catalogo_unidades').where('id', ultimo.unidad_origen_id ?? 0).first();
    const titular = await db('usuarios').where({ id: ultimo.dirigido_anterior_id }).first();
    if (!titular?.activo) {
      throw new AppError('Quien turnó el oficio ya no está activo; repórtalo al administrador', 422);
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      await trx('oficio_turnos').insert({
        oficio_id,
        unidad_origen_id:     actual.unidad_actual ?? null,
        unidad_destino_id:    ultimo.unidad_origen_id,
        dirigido_anterior_id: actual.dirigido_a_id ?? null,
        dirigido_nuevo_id:    titular.id,
        estatus_previo:       oficio.estatus,
        motivo,
        turnado_por_id:       user.id,
        es_devolucion:        true,
        creado_en:            new Date(),
      });

      await trx('oficios').where({ id: oficio_id }).update({
        dirigido_a_id: titular.id,
        estatus:       'RECIBIDO' as EstatusOficio,
      });

      if (oficio.estatus !== 'RECIBIDO') {
        await createAuditLog(trx, oficio_id, oficio.estatus, 'RECIBIDO', user.id);
      }
    });

    // Aviso a quien lo había turnado, para que lo reencamine.
    const encargadosDestino = await db('configuracion_flujos')
      .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'ENCARGADO', unidad_id: ultimo.unidad_origen_id })
      .whereNotNull('usuario_id')
      .pluck('usuario_id');
    const datosOficio = await db('oficios').where({ id: oficio_id })
      .select('folio', 'dependencia_origen').first();
    notifyDelegatorio({
      event:              'OFICIO_TURNADO',
      usuarioIds:         [...encargadosDestino, titular.id, ultimo.turnado_por_id],
      oficio_id,
      folio:              datosOficio?.folio ?? '',
      dependencia_origen: datosOficio?.dependencia_origen ?? undefined,
      area:               destino?.nombre ?? 'tu área',
      nota:               `Devuelto por no ser de su competencia: ${motivo}`,
    }).catch((err) => logger.error({ err, oficio_id }, 'Notificación de devolución falló'));

    res.json({ message: `Oficio devuelto a ${destino?.nombre ?? 'el área anterior'}` });
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
        observaciones:    mayus(motivo),
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
        observaciones:    mayus(observaciones),
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

      // VOBO_APROBADO también entra: un oficio que la Dirección General regresó de
      // firma ya trae el visto bueno dado, y aun así hay que devolvérselo al jurídico
      // que redactó la contestación. Si estaba esperando firma, primero se regresa.
      if (!['EN_REVISION', 'EN_RECONSIDERACION', 'VOBO_APROBADO'].includes(oficio.estatus)) {
        throw new AppError(
          `El oficio debe estar EN_REVISION para solicitar reconsideración (estatus: ${oficio.estatus})`,
          422,
        );
      }
      if (oficio.estatus === 'VOBO_APROBADO' && await enPaseFirma(oficio_id, trx)) {
        throw new AppError(
          'Este oficio está esperando la firma de la Dirección General. Pídele que lo regrese antes de mandarlo a corregir.',
          409,
        );
      }

      // Obtener versión actual del proyecto
      const gestion = await trx('gestiones_contestacion').where({ oficio_id }).first();
      const version = gestion?.version_proyecto ?? 1;

      await trx('comentarios_reconsideracion').insert({
        oficio_id,
        encargado_id: user.id,
        comentario:   comentario.trim().toUpperCase(),
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

    const estados = await db('auditoria_estados as a')
      .join('usuarios as u', 'u.id', 'a.usuario_id')
      .where('a.oficio_id', oficio_id)
      .select(
        'a.id', 'a.estado_anterior', 'a.estado_nuevo', 'a.fecha_cambio',
        'u.nombre as usuario_nombre',
      )
      .orderBy('a.fecha_cambio', 'asc');

    // Los movimientos de delegatorio también son parte de la vida del oficio:
    // se intercalan en la misma línea temporal, con su texto ya armado.
    const delegatorios = await db('delegatorio_comentarios as c')
      .join('oficio_delegatorios as d', 'd.id', 'c.delegatorio_id')
      .join('usuarios as u', 'u.id', 'c.usuario_id')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'd.unidad_destino_id')
      .where('d.oficio_id', oficio_id)
      .select(
        'c.id', 'c.comentario', 'c.estado_previo', 'c.creado_en',
        'u.nombre as usuario_nombre', 'cu.nombre as area',
      )
      // Por id: si dos movimientos caen en el mismo segundo, el orden se respeta.
      .orderBy('c.id', 'asc');

    // Los cambios de área también son parte de la vida del oficio.
    const turnos = await db('oficio_turnos as t')
      .join('usuarios as u', 'u.id', 't.turnado_por_id')
      .leftJoin('catalogo_unidades as origen',  'origen.id',  't.unidad_origen_id')
      .leftJoin('catalogo_unidades as destino', 'destino.id', 't.unidad_destino_id')
      .where('t.oficio_id', oficio_id)
      .select(
        't.id', 't.motivo', 't.estatus_previo', 't.creado_en', 't.es_devolucion',
        'u.nombre as usuario_nombre',
        'origen.nombre as origen', 'destino.nombre as destino',
      )
      .orderBy('t.id', 'asc');

    // Los pases de firma tampoco cambian el estatus, así que no dejarían rastro en
    // la auditoría: se leen de su propia tabla. Cada viaje son dos renglones — la
    // ida siempre, y la vuelta solo cuando ya se resolvió.
    const pases = await db('oficio_pases_firma as pf')
      .join('usuarios as env', 'env.id', 'pf.enviado_por_id')
      .leftJoin('usuarios as cer', 'cer.id', 'pf.cerrado_por_id')
      .where('pf.oficio_id', oficio_id)
      .select(
        'pf.id', 'pf.enviado_en', 'pf.cerrado_en', 'pf.resultado', 'pf.motivo', 'pf.motivo_cierre',
        'env.nombre as enviado_por', 'cer.nombre as cerrado_por',
      )
      .orderBy('pf.id', 'asc');

    const eventosPase = pases.flatMap((p: any) => {
      const ida = {
        // Otro rango de ids negativos, para no chocar con turnos ni delegatorios.
        id:              -2000000 - p.id * 2,
        estado_anterior: 'VOBO_APROBADO',
        estado_nuevo:    'PASE_FIRMA',
        fecha_cambio:    p.enviado_en,
        usuario_nombre:  p.enviado_por,
        detalle:         p.motivo
          ? `A firma de la Dirección General: ${p.motivo}`
          : 'A firma de la Dirección General',
      };
      if (!p.cerrado_en || p.resultado !== 'CORREGIR') return [ida];
      return [ida, {
        id:              -2000000 - (p.id * 2 + 1),
        estado_anterior: 'PASE_FIRMA',
        estado_nuevo:    'PASE_FIRMA_DEVUELTO',
        fecha_cambio:    p.cerrado_en,
        usuario_nombre:  p.cerrado_por ?? 'Dirección General',
        detalle:         `Regresado sin firmar: ${p.motivo_cierre}`,
      }];
    });

    const historial = [
      ...estados,
      ...eventosPase,
      ...turnos.map((t: any) => ({
        // Id negativo y desplazado para no chocar con auditoría ni delegatorios.
        id:              -1000000 - t.id,
        estado_anterior: t.estatus_previo,
        estado_nuevo:    t.es_devolucion ? 'DEVUELTO' : 'TURNADO',
        fecha_cambio:    t.creado_en,
        usuario_nombre:  t.usuario_nombre,
        detalle:         `${t.origen ?? 'Sin área'} → ${t.destino}: ${t.motivo}`,
      })),
      ...delegatorios.map((c: any) => ({
        // Id negativo para no chocar con los de auditoría al usarlo como llave.
        id:              -c.id,
        estado_anterior: c.estado_previo,
        estado_nuevo:    'DELEGATORIO',
        fecha_cambio:    c.creado_en,
        usuario_nombre:  c.usuario_nombre,
        detalle:         c.area ? `${c.area}: ${c.comentario}` : c.comentario,
      })),
    ].sort((a: any, b: any) =>
      new Date(a.fecha_cambio).getTime() - new Date(b.fecha_cambio).getTime(),
    );

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

    // Quién puede recibir un oficio para trabajarlo (el «analista jurídico» del
    // área). No hay un rol capturado para esto: se deduce por exclusión, con las
    // piezas que ya se administran hoy.
    //
    //   · De la misma área que el encargado y con el módulo habilitado.
    //   · Rol OPERATIVO o JURIDICO — deja fuera al titular (DIRECTOR) y a perfiles
    //     ajenos al trámite, como PARTICULAR.
    //   · Que no sea oficial de partes ni encargado: esos capturan y distribuyen,
    //     no elaboran el proyecto de contestación.
    const candidatos = await db('usuarios as u')
      .join('usuario_modulos as um', 'um.usuario_id', 'u.id')
      .join('modulos as m', 'm.id', 'um.modulo_id')
      .where('u.unidad_id', user.oficina_id)
      .andWhere('u.activo', true)
      .andWhere('m.clave', 'oficialia_partes')
      .andWhereNot('u.id', user.id)
      .whereIn('u.rol', ['OPERATIVO', 'JURIDICO'])
      .whereNotExists(function () {
        this.select('*')
          .from('configuracion_flujos as cf')
          .whereRaw('cf.usuario_id = u.id')
          .andWhere('cf.modulo_clave', 'oficialia_partes')
          .whereIn('cf.rol_flujo', ['OFICIAL', 'ENCARGADO']);
      })
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
    // El oficio no avanza mientras alguna área no haya contestado su delegatorio:
    // la contestación oficial debe integrar lo que aportaron todas.
    if (await tieneDelegatoriosPendientes(oficio_id)) {
      throw new AppError('Este oficio tiene delegatorios sin contestar. No se puede dar el VoBo hasta que todas las áreas respondan.', 409);
    }

    // SIGER implica que una delegación tiene que atenderlo.
    if (await sigerSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio está marcado en SIGER, así que debe delegarse a una delegación antes de cerrarse.', 409);
    }
    if (await freSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio tiene marcada la incorporación de FRE, así que debe delegarse a la Dirección de Informática antes de cerrarse.', 409);
    }
    if (await testamentoSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio está marcado como testamento, así que debe delegarse a alguna delegación antes de cerrarse.', 409);
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
    if (!(await puedeSubirFirmado(user, oficioAuth.dirigido_a_id, oficio_id))) {
      throw new AppError('No autorizado para subir el documento firmado', 403);
    }

    // Igual que en el VoBo: no se firma con delegatorios sin contestar. Se valida
    // antes de tocar el archivo para no guardar nada que luego se rechace.
    if (await tieneDelegatoriosPendientes(oficio_id)) {
      throw new AppError('Este oficio tiene delegatorios sin contestar. No se puede finalizar hasta que todas las áreas respondan.', 409);
    }

    // SIGER implica que una delegación tiene que atenderlo.
    if (await sigerSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio está marcado en SIGER, así que debe delegarse a una delegación antes de cerrarse.', 409);
    }
    if (await freSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio tiene marcada la incorporación de FRE, así que debe delegarse a la Dirección de Informática antes de cerrarse.', 409);
    }
    if (await testamentoSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio está marcado como testamento, así que debe delegarse a alguna delegación antes de cerrarse.', 409);
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

      // Si venía esperando la firma de la Dirección General, ese viaje se cierra aquí.
      await trx('oficio_pases_firma')
        .where({ oficio_id })
        .whereNull('cerrado_en')
        .update({ cerrado_en: new Date(), cerrado_por_id: user.id, resultado: 'FIRMADO' });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'FINALIZADO', user.id);
    });

    // Avisar al área que lo mandó a firma: soltó el oficio y merece saber cómo acabó.
    await avisarCierreDePase(oficio_id).catch((err) =>
      logger.error({ err, oficio_id }, 'Error al avisar el cierre del pase de firma'),
    );

    res.json({ message: 'Oficio finalizado correctamente', compresion: compresionInfo(guardadoFirmado) });
  } catch (err) {
    next(err);
  }
}

/** Aviso a quien mandó el oficio a firma, cuando el pase se cierra por firma. */
async function avisarCierreDePase(oficio_id: number): Promise<void> {
  const pase = await db('oficio_pases_firma')
    .where({ oficio_id, resultado: 'FIRMADO' })
    .orderBy('id', 'desc')
    .select('enviado_por_id')
    .first();
  if (!pase?.enviado_por_id) return;

  const oficio = await db('oficios')
    .where({ id: oficio_id })
    .select('folio', 'dependencia_origen')
    .first();
  if (!oficio) return;

  await notifyDelegatorio({
    event:              'PASE_FIRMA_FIRMADO',
    usuarioIds:         [pase.enviado_por_id],
    oficio_id,
    folio:              oficio.folio,
    dependencia_origen: oficio.dependencia_origen,
    area:               'Dirección General',
  });
}

// ─── POST /oficios/:id/pase-firma ────────────────────────────────────────────

/**
 * El área manda el oficio a firma de la Directora General.
 *
 * Pasa cuando el asunto ya está resuelto y aprobado en el área, pero la firma no
 * le corresponde a su titular. No es un turno: el oficio no cambia de área ni de
 * destinatario, y el área lo sigue viendo en su lista. Solo cambia quién lo cierra.
 *
 * Lo deciden quien dio el visto bueno y el encargado.
 */
export async function mandarAPaseFirma(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user      = req.user!;
    const oficio_id = parseInt(req.params.id, 10);
    const motivo    = String(req.body?.motivo ?? '').trim().toUpperCase();

    const oficio = await db('oficios')
      .where({ id: oficio_id })
      .select('id', 'folio', 'estatus', 'dirigido_a_id', 'dependencia_origen')
      .first();
    if (!oficio) throw new AppError('Oficio no encontrado', 404);

    if (!(await puedeMandarAPaseFirma(user, oficio.dirigido_a_id))) {
      throw new AppError('Solo quien da el visto bueno o el encargado del área pueden mandarlo a firma', 403);
    }
    if (oficio.estatus !== 'VOBO_APROBADO') {
      throw new AppError(
        `El oficio debe tener el visto bueno de su área antes de mandarlo a firma (estatus actual: ${oficio.estatus})`,
        422,
      );
    }
    if (await enPaseFirma(oficio_id)) {
      throw new AppError('Este oficio ya está esperando la firma de la Dirección General', 409);
    }

    // Los mismos frenos que para firmar: no se manda a firma algo que no está completo.
    if (await tieneDelegatoriosPendientes(oficio_id)) {
      throw new AppError('Este oficio tiene delegatorios sin contestar. No se puede mandar a firma hasta que todas las áreas respondan.', 409);
    }
    if (await sigerSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio está marcado en SIGER, así que debe delegarse a una delegación antes de mandarlo a firma.', 409);
    }
    if (await freSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio tiene marcada la incorporación de FRE, así que debe delegarse a la Dirección de Informática antes de mandarlo a firma.', 409);
    }
    if (await testamentoSinDelegatorio(oficio_id)) {
      throw new AppError('Este oficio está marcado como testamento, así que debe delegarse a alguna delegación antes de mandarlo a firma.', 409);
    }

    await db('oficio_pases_firma').insert({
      oficio_id,
      enviado_por_id: user.id,
      enviado_en:     new Date(),
      motivo:         motivo || null,
    });

    const destinatarios = await destinatariosPaseFirma();
    await notifyDelegatorio({
      event:              'PASE_FIRMA_ENVIADO',
      usuarioIds:         destinatarios,
      oficio_id,
      folio:              oficio.folio,
      dependencia_origen: oficio.dependencia_origen,
      area:               'Dirección General',
      nota:               motivo || undefined,
    }).catch((err) => logger.error({ err, oficio_id }, 'Error al avisar el pase de firma'));

    res.json({ message: 'El oficio quedó en espera de la firma de la Dirección General' });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /oficios/:id/pase-firma/devolver ──────────────────────────────────

/**
 * La Dirección General regresa el oficio al área en vez de firmarlo.
 *
 * El oficio conserva su visto bueno y vuelve a quedar en manos de quien lo mandó,
 * que decide si lo corrige y lo reenvía o si se lo regresa al jurídico que redactó
 * la contestación, con la reconsideración de siempre.
 */
export async function devolverPaseFirma(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user      = req.user!;
    const oficio_id = parseInt(req.params.id, 10);
    const motivo    = String(req.body?.motivo ?? '').trim().toUpperCase();

    if (!motivo) throw new AppError('Indica qué hay que corregir', 422);
    if (!(await canActAsSecretaria(user))) {
      throw new AppError('Solo la Dirección General puede regresar un oficio que está a firma', 403);
    }

    const pase = await db('oficio_pases_firma')
      .where({ oficio_id })
      .whereNull('cerrado_en')
      .first();
    if (!pase) throw new AppError('Este oficio no está esperando firma de la Dirección General', 409);

    await db('oficio_pases_firma')
      .where({ id: pase.id })
      .update({ cerrado_en: new Date(), cerrado_por_id: user.id, resultado: 'CORREGIR', motivo_cierre: motivo });

    const oficio = await db('oficios')
      .where({ id: oficio_id })
      .select('folio', 'dependencia_origen')
      .first();

    if (oficio) {
      await notifyDelegatorio({
        event:              'PASE_FIRMA_DEVUELTO',
        usuarioIds:         [pase.enviado_por_id],
        oficio_id,
        folio:              oficio.folio,
        dependencia_origen: oficio.dependencia_origen,
        area:               'Dirección General',
        nota:               motivo,
      }).catch((err) => logger.error({ err, oficio_id }, 'Error al avisar la devolución del pase de firma'));
    }

    res.json({ message: 'El oficio regresó al área que lo mandó a firma' });
  } catch (err) {
    next(err);
  }
}
