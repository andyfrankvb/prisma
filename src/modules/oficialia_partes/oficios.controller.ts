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
import { unidadDelOficio } from './destinos';
import { recordarCorreo } from './catalogos.controller';
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
 * De qué áreas se puede sacar a un analista para trabajar un oficio.
 *
 * El área del oficio, más las áreas que dirige quien reparte. Lo segundo no es
 * una concesión: un encargado puede dirigir un área sin estar adscrito a ella
 * —el de la Dirección General figura en la Dirección Jurídica—, y reparte con su
 * propio equipo porque el área que dirige no tiene analistas propios.
 *
 * Vive aquí, y no repetida en cada lugar, porque el desplegable y la validación
 * del servidor tienen que decir exactamente lo mismo: si la pantalla ofrece a
 * alguien que el servidor rechaza, la acción falla a la cara del usuario; si
 * ofrece de más, se cuela una asignación inválida.
 *
 * Sin `oficioId` responde solo con las áreas del usuario. Es el caso de la
 * bandeja de delegatorios, donde el reparto es dentro de la propia área.
 */
async function unidadesParaAsignar(user: any, oficioId: number | null): Promise<number[]> {
  const unidades = new Set<number>();

  if (oficioId) {
    const delOficio = await unidadDelOficio(oficioId);
    if (delOficio) unidades.add(Number(delOficio));
  }
  for (const u of await getUnidadesEncargado(user.id)) unidades.add(Number(u));
  if (!unidades.size && user.oficina_id) unidades.add(Number(user.oficina_id));

  return [...unidades];
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
 * ¿Quién aprueba se elige en esta área?
 *
 * En delegaciones y direcciones de área sí: puede darlo el titular o el
 * encargado, según `catalogo_unidades.vobo_por`.
 *
 * La Dirección General queda fuera **a propósito**. Ahí el visto bueno del flujo
 * es siempre del encargado, sobre el trabajo de su propio equipo; la Directora
 * General no interviene en ese paso. Lo suyo es la firma: aprueba o regresa lo
 * que el encargado le manda ya terminado.
 *
 * No es una omisión que convenga «arreglar»: el renglón de la Dirección General
 * trae guardado `DELEGADO` de un valor por omisión que nunca se usó, así que
 * incluirla aquí le pasaría el visto bueno a la Directora sin que nadie lo pida.
 */
const TIPOS_CON_VOBO_CONFIGURABLE = TIPOS_CON_FLUJO_PROPIO;
function voboEsConfigurable(rol?: string | null, tipo?: string | null): boolean {
  return rol === 'DIRECTOR' && TIPOS_CON_VOBO_CONFIGURABLE.includes(tipo ?? '');
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
    if (voboEsConfigurable(dirigido?.rol, dirigido?.tipo)) {
      // Configurable por unidad: el VoBo lo da el ENCARGADO o el titular
      // (delegado en una delegación, director o directora general en las demás).
      // Sin configurar, la columna trae 'ENCARGADO' por omisión, que es como
      // venía funcionando la Dirección General antes de poder elegir.
      if ((dirigido.vobo_por ?? 'ENCARGADO') === 'ENCARGADO') {
        const encargadoId = await resolverEncargadoDeOficio(dirigidoAId);
        return encargadoId === user.id;
      }
      return user.id === dirigidoAId;
    }
  }
  return canActAsEncargado(user);
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
 * VOBO_APROBADO). En la Dirección General lo suben su encargado, su titular o
 * quien tenga la carga del firmado —ninguno en lugar del otro: cualquiera de los
 * tres, y el primero que lo suba cierra.
 */
async function puedeSubirFirmado(user: any, dirigidoAId: number | null, oficio_id?: number): Promise<boolean> {
  if (oficio_id && await enPaseFirma(oficio_id)) return puedeCerrarPaseFirma(user);

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
    // Dirección General: su encargado —que es quien dio el visto bueno— y también
    // la propia Directora General, que hasta ahora dependía de que alguien más le
    // subiera su firma. La carga del firmado sigue valiendo, más abajo: se suman,
    // no se sustituyen.
    if (user.id === dirigidoAId) return true;
    const encargadoId = await resolverEncargadoDeOficio(dirigidoAId);
    if (encargadoId === user.id) return true;
  }
  return canActAsSecretaria(user);
}

/**
 * ¿Es este usuario la titular de la Dirección General?
 *
 * Se resuelve contra la base y no contra el token: el token trae lo que era
 * cierto al iniciar sesión, y un cambio de adscripción tardaría en notarse.
 *
 * Hace falta porque un oficio en pase de firma **sigue dirigido al área que lo
 * trabajó** —el destinatario es un dato del documento y no se reescribe—, así
 * que la Directora no aparece por ninguna de las reglas normales, aunque sea
 * ella quien lo tiene enfrente para firmarlo.
 */
async function esTitularDireccionGeneral(user: any): Promise<boolean> {
  if (!user?.id) return false;
  const row = await db('usuarios as u')
    .join('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
    .where('u.id', user.id)
    .andWhere('u.rol', 'DIRECTOR')
    .andWhere('u.activo', true)
    .andWhere('cu.tipo', 'DIRECCION_GENERAL')
    .first();
  return !!row;
}

/**
 * Quién cierra un oficio que está esperando la firma de la Dirección General:
 * la propia Directora, o cualquiera de las personas con la carga del firmado.
 * Se suman, no se turnan: el primero que lo suba lo cierra.
 */
async function puedeCerrarPaseFirma(user: any): Promise<boolean> {
  return (await canActAsSecretaria(user)) || esTitularDireccionGeneral(user);
}

/**
 * ¿Puede este usuario regresar el oficio a corregir?
 *
 * Aprobar y regresar no alcanzan a la misma gente. Aprobar es del aprobador del
 * área y de nadie más: el visto bueno del flujo lo da quien esté configurado,
 * sobre el trabajo de su equipo.
 *
 * Regresar alcanza además a quienes reciben el oficio **ya terminado, para
 * firma**: la Directora General y quienes tienen la carga del firmado. Si al ir a
 * firmarlo advierten que algo está mal, tienen que poder devolverlo con su
 * observación, en vez de firmarlo así o salir a buscar a quien sí pueda.
 *
 * Es solo sobre lo que está a firma. En el paso anterior —el visto bueno interno
 * del área— no intervienen: ahí manda el aprobador.
 */
async function puedeReconsiderarOficio(
  user: any, dirigidoAId: number | null, oficio_id?: number,
): Promise<boolean> {
  if (await puedeAprobarOficio(user, dirigidoAId)) return true;
  // Y quien lo cierra: si el sistema te deja firmar un oficio, te deja negarte.
  // Cubre a la Directora General en lo suyo y en lo que le mandan a firma, y a
  // quien tiene la carga del firmado. Es la misma regla que usa la pantalla para
  // ofrecer el botón; tenerlas distintas dejaba la acción a la vista y el
  // servidor rechazándola.
  return puedeSubirFirmado(user, dirigidoAId, oficio_id);
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

/**
 * ¿Puede esta persona marcar el oficio como de conocimiento?
 *
 * Nació como una facultad de la Dirección Jurídica, pero las delegaciones y las
 * direcciones de área reciben los mismos oficios que solo informan.
 *
 * La tienen los tres que responden por el asunto en su área: el titular —delegado
 * o director—, su encargado, y quien dé el visto bueno. Se nombra al titular
 * aparte y no se deduce del visto bueno, porque en las áreas donde el visto bueno
 * lo da el encargado el jefe se quedaría fuera de su propia área.
 */
async function puedeMarcarConocimientoEn(user: any, dirigidoAId: number | null): Promise<boolean> {
  if (await esDeJuridica(user)) return true;
  if (!dirigidoAId) return false;
  if (user.id === dirigidoAId) return true;                 // el titular del área
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
      // A quién iba dirigido el documento, aunque después se haya turnado.
      .leftJoin('usuarios as dir_orig', 'dir_orig.id', 'oficios.dirigido_a_original_id')
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
        // Para saber si la asignación sigue siendo del área donde vive el oficio:
        // al turnarlo, la asignación anterior no se borra y quedaría dando
        // permisos —y bandeja— a alguien de un área que ya lo soltó.
        'abogado_u.unidad_id as abogado_unidad_id',
        'dir_u.rol as dirigido_a_rol',
        'dir_u.nombre as dirigido_a_nombre',
        'dir_orig.nombre as dirigido_a_original_nombre',
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
                    AND t.unidad_destino_id = dir_u.unidad_id
                    AND t.tipo = 'COMPETENCIA')::int
                AS turnos_recibidos`),
        // ¿Y sigue sin aceptarse? Recibir es un acto explícito: hasta que el
        // área lo acepta puede regresarlo, y después ya no. Antes la opción de
        // devolver no caducaba nunca, ni con el visto bueno dado.
        db.raw(`EXISTS (SELECT 1 FROM oficio_turnos t
                         WHERE t.oficio_id = oficios.id
                           AND t.unidad_destino_id = dir_u.unidad_id
                           AND t.aceptado_en IS NULL
                           AND NOT t.es_devolucion)
                AS turno_por_aceptar`),
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
        // Llegó a esta área desde otra, por competencia o con información
        // trabajada. Distinto de lo que capturó la propia oficialía.
        db.raw(`EXISTS (SELECT 1 FROM oficio_turnos t2
                         WHERE t2.oficio_id = oficios.id
                           AND t2.unidad_destino_id = dir_u.unidad_id)
                AS llego_de_otra_area`),
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
        db.raw(`CASE WHEN oficios.tiene_termino AND oficios.vence_en IS NOT NULL
                     THEN ceil(EXTRACT(EPOCH FROM (oficios.vence_en - now())) / 3600.0)
                END::int AS horas_para_vencer`),
        'enc_u.nombre as encargado_nombre',
        'fin_aud.fecha_cambio as fecha_firmado',
        'oficial_u.nombre as ingresado_por_nombre',
        /**
         * ¿Hay un proyecto de contestación guardado?
         *
         * La pantalla lo deducía del estatus —solo en revisión o aprobado—, y por
         * eso un oficio turnado a otra área, que vuelve a RECIBIDO o ASIGNADO,
         * escondía el borrador que ya existía. Se pregunta por el archivo, que es
         * lo que de verdad determina si hay algo que abrir: al firmar se borra y
         * la respuesta pasa a ser no, sin depender de ningún estatus.
         */
        db.raw(`EXISTS (SELECT 1 FROM gestiones_contestacion g
                         WHERE g.oficio_id = oficios.id
                           AND g.proyecto_url IS NOT NULL)
                AS tiene_proyecto`),
      );

    // Unidades de las que el usuario es ENCARGADO (routing por "dirigido a")
    const unidadesEncargado = await getUnidadesEncargado(user.id);
    const esEncargadoFlujo   = unidadesEncargado.length > 0;

    // ── «Mi bandeja»: qué paso del flujo espera algo de MÍ en cada oficio ──────
    //
    // Ver todo lo del área y ver lo que a uno le toca son dos cosas distintas, y
    // mezcladas en una sola lista lo pendiente se pierde entre el histórico.
    //
    // Se resuelve en SQL y no en el navegador a propósito: el número de la pestaña
    // tiene que contar TODO lo pendiente, no solo la página cargada. Y se escribe
    // una sola vez porque se usa en tres lugares —la columna, el conteo y el
    // filtro—: si vivieran por separado, tarde o temprano dirían cosas distintas.
    //
    // Se apoya en «quién puede dar el siguiente paso» y no en la columna «en
    // bandeja de», que en VoBo aprobado muestra al encargado: colgarse de ella
    // dejaría al titular sin ver sus propias firmas pendientes.
    const esSecretariaFlujo = await canActAsSecretaria(user);
    /**
     * Quién cierra un oficio que está a firma de la Dirección General.
     *
     * Tiene que decir exactamente lo mismo que `puedeCerrarPaseFirma`, que es la
     * regla que aplica el servidor al recibir el archivo: la secretaría **y** la
     * titular de la Dirección General, cualquiera de las dos.
     *
     * Estaban desalineadas. Aquí solo se contaba a la secretaría, así que la
     * Directora tenía permiso para subir el firmado pero el oficio nunca le
     * aparecía en «Mi bandeja»: su pestaña salía en 0 mientras la secretaría veía
     * los mismos oficios en «EN FIRMA DG». Podía firmar algo que no podía ver.
     */
    const cierraElPaseFirma = esSecretariaFlujo || await esTitularDireccionGeneral(user);
    // Enteros propios, no entrada del usuario: se interpolan para que `IN` reciba
    // una lista literal. Sin unidades a cargo, `IN (NULL)` nunca es cierto.
    const unidadesSql = unidadesEncargado.length
      ? `(${unidadesEncargado.map(Number).join(',')})`
      : '(NULL)';
    const MI_PASO = `
      CASE
        WHEN oficios.estatus = 'FINALIZADO' OR oficios.de_conocimiento THEN NULL
        WHEN oficios.estatus = 'RECIBIDO'
             AND dir_u.unidad_id IN ${unidadesSql}                       THEN 'ASIGNAR'
        WHEN oficios.estatus = 'ASIGNADO'
             AND ultima_asignacion.abogado_id = ${Number(user.id)}       THEN 'REDACTAR'
        -- Regresado por el propio aprobador: le toca al analista. Regresado desde
        -- arriba: le toca al encargado, que fue quien lo aprobó y lo mandó.
        WHEN oficios.estatus = 'EN_RECONSIDERACION'
             AND NOT oficios.reconsideracion_al_encargado
             AND ultima_asignacion.abogado_id = ${Number(user.id)}       THEN 'REDACTAR'
        WHEN oficios.estatus = 'EN_RECONSIDERACION'
             AND oficios.reconsideracion_al_encargado
             AND dir_u.unidad_id IN ${unidadesSql}                       THEN 'REDACTAR'
        WHEN oficios.estatus = 'EN_REVISION' AND (
               CASE WHEN dir_u.rol = 'DIRECTOR'
                         AND dir_cu.tipo IN ('DELEGACION', 'DIRECCION')
                         AND dir_cu.vobo_por <> 'ENCARGADO'
                    THEN oficios.dirigido_a_id = ${Number(user.id)}
                    ELSE dir_u.unidad_id IN ${unidadesSql}
               END)                                                      THEN 'VISTO_BUENO'
        WHEN oficios.estatus = 'VOBO_APROBADO' AND (
               CASE WHEN EXISTS (SELECT 1 FROM oficio_pases_firma pf
                                  WHERE pf.oficio_id = oficios.id
                                    AND pf.cerrado_en IS NULL)
                    THEN ${cierraElPaseFirma ? 'TRUE' : 'FALSE'}
                    ELSE (oficios.dirigido_a_id = ${Number(user.id)}
                          OR dir_u.unidad_id IN ${unidadesSql})
               END)                                                      THEN 'FIRMAR'
        ELSE NULL
      END`;
    query = query.select(db.raw(`${MI_PASO} AS mi_paso`));

    /**
     * Lo que un área alcanza a ver: lo dirigido a ella, y además lo que ella misma
     * mandó a otra área con su trabajo hecho.
     *
     * Lo turnado **por competencia** queda fuera a propósito: si el área se
     * deslindó del asunto, dejó de ser suyo y seguirlo viendo solo estorba. En
     * cambio, cuando mandó lo que ya había trabajado —una resolución, un envío de
     * información— sigue queriendo saber en qué acabó, y hasta ahora el oficio
     * simplemente desaparecía de su vista sin dejar rastro.
     *
     * Lo enviado se ve pero no se puede tocar: los permisos se resuelven contra
     * el área que lo tiene hoy, así que ninguna acción se habilita.
     */
    const ENVIADO_POR = (unidades: number[]) => {
      const lista = unidades.length ? unidades.map(Number).join(',') : 'NULL';
      return `EXISTS (SELECT 1 FROM oficio_turnos ts
                       WHERE ts.oficio_id = oficios.id
                         AND ts.unidad_origen_id IN (${lista})
                         AND ts.tipo <> 'COMPETENCIA')`;
    };

    /**
     * Oficios sobre los que otra área le pidió información a la mía.
     *
     * El oficio no cambia de dueño —sigue siendo de quien lo pidió—, así que sin
     * esto no aparecía en ninguna lista del área destino: la única forma de
     * atenderlo era un cuadro suelto arriba de la bandeja. Al quitar ese cuadro,
     * quien recibía una solicitud se quedaba sin manera de llegar a ella.
     */
    const CON_SOLICITUD = (unidades: number[]) => {
      const lista = unidades.length ? unidades.map(Number).join(',') : 'NULL';
      return `EXISTS (SELECT 1 FROM oficio_delegatorios ds
                       WHERE ds.oficio_id = oficios.id
                         AND ds.unidad_destino_id IN (${lista}))`;
    };

    const scopeEncargado = (q: any) =>
      q.where((sub: any) => {
        sub.whereIn('dir_u.unidad_id', unidadesEncargado)
           .orWhereRaw(ENVIADO_POR(unidadesEncargado))
           .orWhereRaw(CON_SOLICITUD(unidadesEncargado));
      });

    /**
     * Los oficios que este analista tiene asignados y todavía le tocan.
     *
     * Vivía escrito dos veces —en `OPERATIVO` y en el `default`— y una tercera
     * versión sin la última condición en `JURIDICO`. Tres copias de la misma
     * regla es como se desincronizan las cosas, así que ahora es una sola.
     *
     * ── Qué caduca una asignación ──────────────────────────────────────────
     *
     * Turnar un oficio a otra área NO borra la asignación anterior. Sin algo que
     * la caduque, el oficio se quedaba en la bandeja del analista viejo para
     * siempre, aunque el asunto viviera ya en otra dirección.
     *
     * Antes eso se resolvía exigiendo que el analista fuera de la misma unidad
     * que el oficio. Funcionaba de rebote y cobraba de más: también escondía el
     * caso legítimo de un analista de otra área a quien su encargado le asignó
     * trabajo. Ocurre de verdad —el encargado de la Dirección General está
     * adscrito a la Dirección Jurídica y reparte con su propio equipo—, y esos
     * oficios desaparecían de toda bandeja sin que nadie se enterara.
     *
     * La pregunta correcta no es de qué área es el analista, sino si el oficio se
     * movió DESPUÉS de que se lo asignaran. Eso se responde con las fechas:
     *
     *   · Hubo un turnado posterior  → la asignación quedó vieja → se oculta.
     *   · No lo hubo                 → sigue siendo suyo, venga del área que venga.
     *
     * Si el oficio se fue y volvió, también se oculta: el turnado de regreso es
     * posterior igual. El encargado lo reparte de nuevo, que es lo que toca.
     *
     * Va como predicado y no como JOIN para poder combinarse con un OR: un
     * analista ve lo suyo Y además los expedientes ajenos donde le pidieron
     * información. `EXISTS` tampoco duplica renglones al paginar, que era lo que
     * el JOIN con `DISTINCT ON` venía a evitar.
     */
    const TENGO_ASIGNADO = `EXISTS (
      SELECT 1
        FROM (
          SELECT DISTINCT ON (oficio_id) oficio_id, abogado_id, fecha_asignacion
            FROM asignaciones_juridicas
           ORDER BY oficio_id, id DESC
        ) AS ua
       WHERE ua.oficio_id  = oficios.id
         AND ua.abogado_id = ${Number(user.id)}
         AND NOT EXISTS (
           SELECT 1 FROM oficio_turnos t
            WHERE t.oficio_id = ua.oficio_id
              AND t.creado_en > ua.fecha_asignacion
         )
    )`;

    /**
     * Los oficios sobre los que ESTA PERSONA tiene una solicitud que contestar.
     *
     * El expediente es de otra área y no le corresponde; lo que le corresponde es
     * la información que le pidieron sobre él. Sin esto el oficio no aparece por
     * ningún lado —no es suyo ni de su área— y la solicitud quedaba sin nadie que
     * la viera, aunque estuviera asignada con nombre y apellido.
     *
     * Es el mismo trato que ya recibe el encargado del área destino con
     * `CON_SOLICITUD`, que por eso sí ve el renglón. Aquí baja al analista.
     *
     * Solo mientras siga abierta: contestada o cancelada, el oficio ajeno deja de
     * tener por qué salir en su lista.
     */
    const SOLICITUD_ASIGNADA_A_MI = `EXISTS (
      SELECT 1 FROM oficio_delegatorios dmia
       WHERE dmia.oficio_id = oficios.id
         AND dmia.asignado_a_id = ${Number(user.id)}
         AND dmia.estado IN ('PENDIENTE','ASIGNADO','EN_REVISION')
    )`;

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

        // En cualquiera de las dos ramas se suman los expedientes ajenos donde le
        // pidieron información: la solicitud es suya aunque el oficio no lo sea, y
        // sin esto no aparece en ninguna de las dos vistas.
        query = query.where((sub: any) => {
          if (asignacionOperativo) {
            sub.whereRaw(TENGO_ASIGNADO);
          } else {
            sub.where((reg: any) => {
              reg.where('oficios.unidad_registro_id', user.oficina_id)
                 .andWhere('oficios.oficial_registro_id', user.id);
            });
          }
          sub.orWhereRaw(SOLICITUD_ASIGNADA_A_MI);
        });
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
        query = query.where((sub: any) => {
          sub.where('oficios.dirigido_a_id', user.id)
             .orWhereRaw(ENVIADO_POR(user.unidad_id ? [Number(user.unidad_id)] : []));
        });
        break;

      case 'JURIDICO':
        // Misma regla que en OPERATIVO. Antes esta variante no caducaba nada, así
        // que un oficio turnado a otra área se quedaba en su bandeja para siempre.
        query = query.where((sub: any) => {
          sub.whereRaw(TENGO_ASIGNADO).orWhereRaw(SOLICITUD_ASIGNADA_A_MI);
        });
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
          query = query.where((sub: any) => {
            sub.whereRaw(TENGO_ASIGNADO).orWhereRaw(SOLICITUD_ASIGNADA_A_MI);
          });
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
          .andWhereRaw('oficios.vence_en < now()');
      } else if (t === 'por_vencer') {
        query = query
          .andWhere('oficios.tiene_termino', true)
          .andWhereNot('oficios.estatus', 'FINALIZADO')
          .andWhereRaw(`oficios.vence_en BETWEEN now() AND now() + INTERVAL '3 days'`);
      }
    }

    // Filtro por área / jefe de área: oficios dirigidos a un director o delegado.
    if (req.query.dirigido_a_id) {
      query = query.andWhere('oficios.dirigido_a_id', Number(req.query.dirigido_a_id));
    }

    // ── Filtro por quién lo tiene en bandeja ──────────────────────────────────
    //
    // Sirve para monitorear: ver todo lo que trae encima una encargada, un
    // jurídico o una delegada. Repite en ids el mismo reparto que se muestra en
    // la columna «En bandeja de», porque ese dato se calcula y no está guardado.
    const BANDEJA_ID = `
      CASE
        WHEN oficios.estatus IN ('ASIGNADO', 'EN_RECONSIDERACION')
          THEN COALESCE(ultima_asignacion.abogado_id, cf_enc.usuario_id)
        WHEN oficios.estatus = 'EN_REVISION' THEN
          CASE WHEN dir_u.rol = 'DIRECTOR'
                    AND dir_cu.tipo IN ('DELEGACION', 'DIRECCION')
                    AND dir_cu.vobo_por <> 'ENCARGADO'
               THEN oficios.dirigido_a_id ELSE cf_enc.usuario_id END
        WHEN oficios.estatus IN ('VOBO_APROBADO', 'FINALIZADO') THEN
          CASE WHEN EXISTS (SELECT 1 FROM oficio_pases_firma pf2
                             WHERE pf2.oficio_id = oficios.id AND pf2.cerrado_en IS NULL)
               THEN (SELECT cf3.usuario_id FROM configuracion_flujos cf3
                      WHERE cf3.modulo_clave = 'oficialia_partes'
                        AND cf3.rol_flujo = 'SECRETARIA' LIMIT 1)
               ELSE cf_enc.usuario_id END
        ELSE cf_enc.usuario_id
      END`;
    if (req.query.en_bandeja_de) {
      query = query.andWhereRaw(`(${BANDEJA_ID}) = ?`, [Number(req.query.en_bandeja_de)]);
    }

    // Se devuelve también quién tiene hoy el oficio. Hasta ahora esa persona solo
    // existía como nombre para mostrar en la columna «En bandeja de», y las
    // acciones se decidían por área: quien respondía por el área veía «Asignar» o
    // «Reasignar» sobre oficios que estaban en la bandeja de otra persona.
    // Con el id se puede exigir que quien actúa sea quien lo tiene.
    query = query.select(db.raw(`(${BANDEJA_ID}) AS bandeja_usuario_id`));

    // ── Filtro por situación ──────────────────────────────────────────────────
    //
    // Va aparte del estatus y no mezclado con él, porque son cosas distintas: un
    // oficio puede estar «Recibido» y además haber llegado turnado. Meterlas en
    // el mismo desplegable obligaría a elegir una y perder la otra.
    const situacion = String(req.query.situacion ?? '');
    if (situacion === 'turnado') {
      query = query.andWhereRaw(`EXISTS (SELECT 1 FROM oficio_turnos t4
                                          WHERE t4.oficio_id = oficios.id
                                            AND t4.unidad_destino_id = dir_u.unidad_id
                                            AND NOT t4.es_devolucion)`);
    } else if (situacion === 'devuelto') {
      query = query.andWhereRaw(`EXISTS (SELECT 1 FROM oficio_turnos t4
                                          WHERE t4.oficio_id = oficios.id
                                            AND t4.unidad_destino_id = dir_u.unidad_id
                                            AND t4.es_devolucion)`);
    } else if (situacion === 'informacion') {
      query = query.andWhereRaw(`EXISTS (SELECT 1 FROM oficio_turnos t4
                                          WHERE t4.oficio_id = oficios.id
                                            AND t4.tipo = 'INFORMACION')`);
    } else if (situacion === 'de_conocimiento') {
      query = query.andWhere('oficios.de_conocimiento', true);
    } else if (situacion === 'en_firma_dg') {
      query = query.andWhereRaw(`EXISTS (SELECT 1 FROM oficio_pases_firma pf4
                                          WHERE pf4.oficio_id = oficios.id
                                            AND pf4.cerrado_en IS NULL)`);
    } else if (situacion === 'delegatorios_pendientes') {
      query = query.andWhereRaw(`EXISTS (SELECT 1 FROM oficio_delegatorios d4
                                          WHERE d4.oficio_id = oficios.id
                                            AND d4.estado IN ('PENDIENTE','ASIGNADO','EN_REVISION'))`);
    }

    // Conteos por estatus (SIN el filtro de estatus, con el resto de filtros y el
    // scope del rol) — para las tarjetas de resumen de la bandeja.
    const conteoRows = await query.clone().clearSelect()
      .select('oficios.estatus')
      .countDistinct('oficios.id as count')
      .groupBy('oficios.estatus');
    const conteos: Record<string, number> = {};
    for (const r of conteoRows as any[]) conteos[String(r.estatus)] = Number(r.count);

    // Cuántos esperan algo de mí. Se cuenta sobre TODO lo que el usuario alcanza a
    // ver —no sobre la página—, así el número de la pestaña es el de verdad.
    //
    // Va aparte de `conteos` a propósito: ese objeto guarda conteos por estatus y
    // hay pantallas que suman sus valores para sacar el total. Meter aquí un
    // número que no es un estatus lo haría contar de más.
    const miBandejaRows = await query.clone().clearSelect()
      .whereRaw(`${MI_PASO} IS NOT NULL`)
      .countDistinct('oficios.id as count');
    const miBandeja = Number((miBandejaRows[0] as any)?.count ?? 0);

    // Y la pestaña, cuando está activa, filtra con la misma expresión.
    if (String(req.query.mi_bandeja) === 'true') {
      query = query.whereRaw(`${MI_PASO} IS NOT NULL`);
    }

    // Lo que llegó de otra área. El número cuenta exactamente lo que la pestaña
    // muestra: si contara solo lo accionable, diría «0» sobre una lista con
    // renglones, que es peor que no ponerlo.
    /**
     * Lo que llegó de otra área y **todavía espera algo**: los oficios turnados
     * que el área aún no acepta, y las solicitudes que otra le hizo y sigue sin
     * contestar.
     *
     * Es una bandeja de pendientes, no un histórico. Antes listaba todo lo que
     * alguna vez había llegado de fuera, así que un oficio aceptado hace semanas
     * seguía ahí para siempre y la pestaña crecía sin que nada de eso reclamara
     * atención. Una vez aceptado, el oficio es del área como cualquier otro y
     * vive en Recepción y en Mi bandeja.
     *
     * Las devoluciones no cuentan: un oficio que regresa vuelve a ser tuyo, no
     * es algo que tengas que aceptar.
     */
    const lista = unidadesEncargado.length ? unidadesEncargado.map(Number).join(',') : 'NULL';

    /**
     * Las áreas de quien consulta: aquella a la que está adscrito, más las que
     * dirige aunque no pertenezca a ellas. Las dos hacen falta —un encargado
     * puede dirigir un área sin estar adscrito— y con una sola se cae un caso:
     * sin la propia, un analista dejaría de ver lo que le llega a su área; sin
     * las dirigidas, el encargado de una delegación dejaría de verlo.
     */
    const MIS_UNIDADES = [Number(user.oficina_id), ...unidadesEncargado.map(Number)]
      .filter((v, i, a) => Number.isFinite(v) && a.indexOf(v) === i)
      .join(',') || 'NULL';

    const DE_OTRA_AREA = `(EXISTS (SELECT 1 FROM oficio_turnos t3
                                    WHERE t3.oficio_id = oficios.id
                                      AND t3.unidad_destino_id = dir_u.unidad_id
                                      -- Que el turno haya llegado a MI área, no
                                      -- solamente al área del destinatario.
                                      --
                                      -- Sin este renglón la condición no mencionaba
                                      -- en ninguna parte a quien consulta: preguntaba
                                      -- si el oficio traía un turno sin aceptar, lo
                                      -- cual es cierto del oficio y no de quien lo
                                      -- mira. El área que turnaba veía en «Turnados»
                                      -- lo que ella misma había mandado, como si le
                                      -- tocara aceptarlo. Las otras dos condiciones de
                                      -- esta pestaña sí se acotaban; esta era la única
                                      -- que no.
                                      AND t3.unidad_destino_id IN (${MIS_UNIDADES})
                                      AND t3.aceptado_en IS NULL
                                      AND NOT t3.es_devolucion)
                           OR EXISTS (SELECT 1 FROM oficio_delegatorios dp
                                       WHERE dp.oficio_id = oficios.id
                                         AND dp.unidad_destino_id IN (${lista})
                                         AND dp.estado IN ('PENDIENTE','ASIGNADO','EN_REVISION'))
                           OR ${SOLICITUD_ASIGNADA_A_MI})`;
    const otrasRows = await query.clone().clearSelect()
      .whereRaw(DE_OTRA_AREA)
      .countDistinct('oficios.id as count');
    const deOtrasAreas = Number((otrasRows[0] as any)?.count ?? 0);

    if (String(req.query.de_otras_areas) === 'true') {
      query = query.whereRaw(DE_OTRA_AREA);
    }

    // Ahora sí, aplica el filtro por estatus (para la lista y el total).
    if (req.query.estatus) {
      query = query.andWhere('oficios.estatus', req.query.estatus as string);
    }

    // Count: clonar sin el SELECT. countDistinct porque el join de documentos
    // (1-a-muchos) puede duplicar filas del mismo oficio.
    const countRows = await query.clone().clearSelect().countDistinct('oficios.id as count');
    const total     = Number((countRows[0] as any)?.count ?? 0);
    // ── Orden de la lista ─────────────────────────────────────────────────────
    //
    // Se ordena en la consulta y no en el navegador: la lista viene paginada, y
    // ordenar solo lo cargado daría un orden falso — el primero de la pantalla no
    // sería el primero de verdad.
    //
    // «En bandeja de» y «Sistemas» son columnas calculadas, así que su criterio se
    // repite aquí en SQL. El de la bandeja sigue el mismo reparto que se muestra:
    // recibido va con el encargado, asignado con el analista, y ya aprobado con la
    // secretaría cuando está esperando la firma de la Dirección General.
    const ORDEN_BANDEJA = `
      CASE
        WHEN oficios.estatus IN ('ASIGNADO', 'EN_RECONSIDERACION')
          THEN COALESCE(abogado_u.nombre, enc_u.nombre)
        WHEN oficios.estatus = 'EN_REVISION' THEN
          CASE WHEN dir_u.rol = 'DIRECTOR'
                    AND dir_cu.tipo IN ('DELEGACION', 'DIRECCION')
                    AND dir_cu.vobo_por <> 'ENCARGADO'
               THEN dir_u.nombre ELSE enc_u.nombre END
        WHEN oficios.estatus IN ('VOBO_APROBADO', 'FINALIZADO') THEN
          CASE WHEN EXISTS (SELECT 1 FROM oficio_pases_firma pf
                             WHERE pf.oficio_id = oficios.id AND pf.cerrado_en IS NULL)
               THEN (SELECT u2.nombre FROM configuracion_flujos cf2
                       JOIN usuarios u2 ON u2.id = cf2.usuario_id
                      WHERE cf2.modulo_clave = 'oficialia_partes'
                        AND cf2.rol_flujo = 'SECRETARIA' LIMIT 1)
               ELSE enc_u.nombre END
        ELSE enc_u.nombre
      END`;
    // Primero los que sí están dados de alta en algún sistema, y entre ellos por NCI.
    // Lleva la dirección en cada tramo: con una sola al final, el criterio principal
    // se quedaba siempre ascendente y «descendente» acababa mostrando los vacíos.
    const ORDEN_SISTEMAS =
      '((CASE WHEN oficios.siqroo_aplica THEN 2 ELSE 0 END)'
      + ' + (CASE WHEN oficios.siger_aplica THEN 1 ELSE 0 END)) %DIR%,'
      + ' oficios.siqroo_control_interno %DIR% NULLS LAST';

    // Cada criterio trae su cláusula completa, con %DIR% donde va la dirección.
    // NULLS LAST siempre: un oficio sin término o sin NCI no debe encabezar la
    // lista solo por estar vacío, se ordene como se ordene.
    const ORDENES: Record<string, string> = {
      folio:    'oficios.folio %DIR%',
      ingreso:  'oficios.fecha_registro %DIR%',
      termino:  'oficios.vence_en %DIR% NULLS LAST',
      estatus:  'oficios.estatus %DIR%',      // el enum ya va en el orden del flujo
      bandeja:  `(${ORDEN_BANDEJA}) %DIR% NULLS LAST`,
      sistemas: ORDEN_SISTEMAS,
      // Texto capturado por personas. Se ordena con la intercalación española:
      // la de la base es en_US.utf8, que manda los acentos al final —«Álvarez» y
      // «Ñeco» caían después de «Zuñiga»— y la lista parecía mal ordenada.
      // `es-MX-x-icu` viene con PostgreSQL, así que no hace falta instalar
      // extensiones ni migrar nada.
      origen:     'oficios.numero_oficio_origen COLLATE "es-MX-x-icu" %DIR% NULLS LAST',
      remitente:  'oficios.remitente COLLATE "es-MX-x-icu" %DIR% NULLS LAST',
      delegacion: 'dir_cu.nombre COLLATE "es-MX-x-icu" %DIR% NULLS LAST',
      // «Qué sigue» sale de un CASE calculado; se reutiliza tal cual para que el
      // orden coincida con lo que la columna muestra.
      paso:       `(${MI_PASO}) %DIR% NULLS LAST`,
    };
    const clausula = ORDENES[String(req.query.orden ?? '')];
    const sentido  = String(req.query.dir ?? '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    if (clausula) {
      // Desempate estable por id: sin él, dos oficios con el mismo valor pueden
      // intercambiarse entre páginas y repetirse o perderse al hacer scroll.
      query = query.orderByRaw(`${clausula.split('%DIR%').join(sentido)}, oficios.id DESC`);
    } else {
      query = query.orderBy('oficios.fecha_registro', 'desc');
    }

    const rows      = await query.limit(limit).offset(offset);

    // Quiénes tienen la carga del firmado, para «en bandeja de» cuando el oficio
    // ya está a firma. Ahora pueden ser varias personas, así que se nombran
    // todas: quedarse con la primera decía que el oficio está con alguien que
    // quizá no sea quien lo va a cerrar.
    const cargaFirmado = await db('configuracion_flujos as cf')
      .join('usuarios as u', 'u.id', 'cf.usuario_id')
      .where({ 'cf.modulo_clave': 'oficialia_partes', 'cf.rol_flujo': 'SECRETARIA' })
      .andWhere('u.activo', true)
      .orderBy('u.nombre', 'asc')
      .pluck('u.nombre');
    const secretariaNombre: string | null = cargaFirmado.length
      ? cargaFirmado.join(' · ')
      : null;

    // ¿El usuario actual es la SECRETARIA? (rol nativo o designada en configuracion_flujos)
    const esSecretaria = await canActAsSecretaria(user);
    // Quien cierra lo que está a firma: la Directora General o la carga del
    // firmado. Se resuelve una sola vez por consulta, no por renglón.
    const cierraPaseFirma = esSecretaria || await esTitularDireccionGeneral(user);

    // Solo la Dirección Jurídica marca oficios «de conocimiento».
    const puedeMarcarConocimiento = await esDeJuridica(user);

    // Compute dias_restantes client-side to avoid DB timezone issues
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oficios = rows.map((o: any) => {
      // Un término por fecha se cuenta en días; uno por horas, en horas. Medir en
      // días un plazo de seis horas siempre daría «vence hoy», que no dice nada.
      let dias_restantes:  number | null = null;
      let horas_restantes: number | null = null;

      if (o.tiene_termino && o.termino_tipo === 'HORAS' && o.horas_para_vencer !== null) {
        horas_restantes = Number(o.horas_para_vencer);
        // Para el semáforo, que razona en días: vencido si ya pasó, si no, hoy.
        dias_restantes  = horas_restantes > 0 ? 0 : -1;
      } else if (o.tiene_termino && o.fecha_vencimiento) {
        const vence = new Date(o.fecha_vencimiento);
        vence.setHours(0, 0, 0, 0);
        dias_restantes = Math.ceil((vence.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      // ¿Quién tiene el oficio en su bandeja ahora? (según el estatus del flujo)
      // Delegaciones y direcciones de área resuelven su propio VoBo y su propia firma.
      const esFlujoPropio = tieneFlujoPropio(o.dirigido_a_rol, o.dirigido_a_unidad_tipo);
      // Quién da el VoBo se configura por unidad (catalogo_unidades.vobo_por): el
      // titular —delegado, director o directora general— o el encargado. La
      // Dirección General ya entra en esa configuración; mientras nadie la haya
      // tocado, la columna vale 'ENCARGADO' y se comporta como antes.
      const voboLoDaElEncargado =
        voboEsConfigurable(o.dirigido_a_rol, o.dirigido_a_unidad_tipo)
          ? (o.vobo_por_unidad ?? 'ENCARGADO') === 'ENCARGADO'
          : true;
      // Nombre de quien aprueba (para bandeja EN_REVISION y "vobo_por_nombre").
      const aprobadorNombre = voboLoDaElEncargado ? o.encargado_nombre : o.dirigido_a_nombre;

      /**
       * ¿Responde el usuario por el área donde vive hoy el oficio?
       *
       * Ser encargado se sabía de forma global —«¿soy encargado de alguna
       * unidad?»— y con eso se ofrecían acciones en cualquier renglón. Desde que
       * un área conserva la vista de lo que mandó a otra, eso alcanza para
       * ofrecerle «Asignar» sobre un oficio que ya no es suyo: el clic falla en
       * el servidor, pero no debió llegar a mostrarse.
       */
      const es_de_mi_area = o.dirigido_a_id === user.id
        || unidadesEncargado.includes(o.dirigido_a_unidad_id);

      /**
       * ¿Tengo yo el oficio en este momento?
       *
       * `es_de_mi_area` responde algo distinto —«¿responde mi área por él?»— y con
       * eso se ofrecían acciones sobre oficios que estaban con otra persona. El
       * caso que lo destapó: quien figura como «Dirigido a» veía «Asignar» y
       * «Reasignar» sobre oficios que vivían en la bandeja del encargado de esa
       * unidad, que es quien de verdad los tiene.
       */
      /**
       * `bandeja_usuario_id` nombra a UNA sola persona, y a firma son dos: la
       * secretaría y la Directora. La consulta devuelve a la secretaría —es quien
       * normalmente sube el escaneado—, así que sin esta segunda condición la
       * Directora veía el oficio en su bandeja pero con las acciones apagadas,
       * porque el frontend las cuelga de este dato.
       */
      const en_mi_bandeja = Number((o as any).bandeja_usuario_id) === user.id
        || (!!(o as any).en_pase_firma && cierraPaseFirma);

      /**
       * Excepción deliberada a la regla anterior: el encargado de la unidad puede
       * reasignar oficios de su propia área aunque estén en la bandeja de alguien
       * de su equipo. Sin esto, repartir el trabajo dejaría de ser posible en
       * cuanto el oficio se asigna, y bastaría una incapacidad o unas vacaciones
       * para dejarlo atorado sin que nadie pueda recuperarlo.
       */
      const soy_encargado_del_area = unidadesEncargado.includes(o.dirigido_a_unidad_id);

      /**
       * ¿Puede corregir lo que la oficialía capturó mal?
       *
       * Todo el área donde vive el oficio —su titular, el encargado y su equipo—,
       * más el encargado configurado de esa unidad aunque esté adscrito a otra,
       * que es el caso de la Dirección General.
       *
       * Se corta en FINALIZADO: ahí el documento ya salió firmado, y cambiar el
       * remitente reescribiría lo que dice un papel que ya está en manos de la
       * autoridad que lo pidió.
       */
      const puede_corregir = o.estatus !== 'FINALIZADO'
        && (user.oficina_id === o.dirigido_a_unidad_id || soy_encargado_del_area);

      let en_bandeja_de: string | null;
      switch (o.estatus) {
        case 'RECIBIDO':                              // sin reasignar → el encargado
          en_bandeja_de = o.encargado_nombre; break;
        case 'ASIGNADO':
          en_bandeja_de = o.abogado_nombre ?? o.encargado_nombre; break;
        case 'EN_RECONSIDERACION':
          // Normalmente baja al jurídico que lo redactó. Pero si quien lo regresó
          // fue alguien de arriba —la Directora General, la carga del firmado—,
          // el oficio venía ya aprobado y a quien le toca responder es el
          // encargado que lo aprobó, no el analista.
          en_bandeja_de = (o as any).reconsideracion_al_encargado
            ? aprobadorNombre
            : (o.abogado_nombre ?? o.encargado_nombre);
          break;
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

      // Un área sin encargado configurado no es lo mismo que «no aplica», pero
      // se veía igual: un guion. Los oficios dirigidos a esa unidad no caen con
      // nadie, nadie puede asignarlos y se quedan en RECIBIDO para siempre, sin
      // que nada en la pantalla lo delate. Decirlo es la única forma de que
      // alguien vaya a Configuración de Flujos a arreglarlo.
      if (!en_bandeja_de) en_bandeja_de = 'Sin encargado configurado';

      // Delegatorios sin contestar: bloquean VoBo y firma, y la interfaz lo explica.
      const delegatorios_pendientes = Number((o as any).delegatorios_pendientes ?? 0);

      // ¿Puede el usuario actual dar el VoBo?
      const sigerPendiente = !!(o as any).siger_sin_delegatorio
        || !!(o as any).fre_sin_delegatorio
        || !!(o as any).testamento_sin_delegatorio;
      // La autoridad sobre el oficio, sin los frenos: quien aprueba en esa área.
      // Se separa porque el visto bueno sí espera a los delegatorios, pero marcar
      // de conocimiento no depende de ellos —y desmarcarlo, menos—.
      const esElAprobador = voboLoDaElEncargado
        ? unidadesEncargado.includes(o.dirigido_a_unidad_id)   // el encargado de esa unidad
        : o.dirigido_a_id === user.id;                         // el titular (dirigido a)
      const puede_vobo = delegatorios_pendientes === 0 && !sigerPendiente && esElAprobador;

      // Por qué NO se puede cerrar todavía, dicho con palabras. Sin esto la
      // acción simplemente desaparecía del menú y la persona se quedaba viendo
      // «te toca dar el visto bueno» sin manera de hacerlo ni razón a la vista.
      const bloqueo: string | null =
          delegatorios_pendientes > 0
            ? (delegatorios_pendientes === 1
                ? 'Falta que un área conteste su delegatorio'
                : `Faltan ${delegatorios_pendientes} áreas por contestar su delegatorio`)
        : (o as any).siger_sin_delegatorio
            ? 'Está marcado en SIGER y no se ha delegado a ninguna delegación'
        : (o as any).fre_sin_delegatorio
            ? 'Tiene FRE marcado y no se ha delegado a la Dirección de Informática'
        : (o as any).testamento_sin_delegatorio
            ? 'Está marcado como testamento y no se ha delegado a ninguna delegación'
        : null;

      // Responsable del visto bueno (nombre).
      const vobo_por_nombre = aprobadorNombre;

      // ¿Puede el usuario actual subir el firmado / finalizar este oficio?
      // En pase de firma lo cierra la secretaría, venga de donde venga. Si no, lo
      // cierra su propia área —el titular o el encargado—, y eso vale también para
      // la Dirección General: su encargado se queda con el oficio al aprobarlo.
      const enPase = !!(o as any).en_pase_firma;
      const puede_finalizar = delegatorios_pendientes === 0 && !sigerPendiente && (enPase
        ? cierraPaseFirma
        : (o.dirigido_a_id === user.id || unidadesEncargado.includes(o.dirigido_a_unidad_id)));

      // Mandarlo a firma de la Dirección General: quien dio el visto bueno y el
      // encargado del área, en todas las áreas del módulo.
      const puede_mandar_firma = o.estatus === 'VOBO_APROBADO'
        && !enPase
        && delegatorios_pendientes === 0
        && !sigerPendiente
        && (puede_vobo || unidadesEncargado.includes(o.dirigido_a_unidad_id));

      // Y regresarlo al área sin firmarlo, mientras esté a firma: la Directora
      // General o la carga del firmado. Quien puede firmarlo tiene que poder
      // negarse; antes solo la secretaría, y la Directora dependía de pedírselo.
      const puede_devolver_pase_firma = enPase && cierraPaseFirma;

      /**
       * Quién lo cierra, sin mirar si algo lo frena ahora mismo.
       *
       * Va aparte de `puede_finalizar` porque esa lleva incorporados los frenos
       * —delegatorios sin contestar, SIGER sin delegar—, y para regresar un oficio
       * los frenos no vienen al caso: si está trabado es cuando más falta hace
       * poder devolverlo.
       */
      const cierraElOficio = enPase
        ? cierraPaseFirma
        : (o.dirigido_a_id === user.id || unidadesEncargado.includes(o.dirigido_a_unidad_id));

      /**
       * Regresar el oficio a corregir: el aprobador del área, y quien lo cierra.
       *
       * La regla es «quien puede firmarlo tiene que poder negarse». La Directora
       * General recibe oficios ya aprobados para firmarlos, y sin esto no tenía
       * cómo detener uno que no le pareciera: el visto bueno de la Dirección
       * General lo da su encargado, así que ella no contaba como aprobadora y se
       * quedaba solo con «Subir firmado».
       */
      const puede_reconsiderar = esElAprobador || cierraElOficio;

      // Turnar a otra área: lo hace el encargado del área que hoy tiene el oficio.
      // Turna quien responde por el área: su titular o el encargado de oficios.
      //
      // Con el visto bueno ya dado, el oficio deja de poder soltarse: el área lo
      // trabajó y lo aprobó, así que mandarlo por no competencia contradiría el
      // expediente y tiraría el proyecto. Lo que queda es firmarlo, mandarlo a
      // firma o regresarlo a corregir. Pedirle información a otra área sí sigue
      // valiendo, y eso lo resuelve `puede_solicitar`.
      const cerrado = o.estatus === 'VOBO_APROBADO' || o.estatus === 'FINALIZADO' || enPase;
      const puede_turnar = !cerrado
        && (o.dirigido_a_id === user.id || unidadesEncargado.includes(o.dirigido_a_unidad_id));

      // Y devolverlo, solo si llegó por un turno.
      /**
       * Recibir un oficio turnado, y su contrario.
       *
       * Mientras el turno no se acepte, el área puede tomarlo o regresarlo. Una
       * vez aceptado —o en cuanto se asigna, que ya es tomarlo— la opción de
       * regresarlo desaparece: devolver deja el oficio en RECIBIDO en el área de
       * origen, y hacerlo con el trabajo hecho dejaba huérfanos el proyecto y el
       * visto bueno. A partir de ahí la salida es turnarlo por no competencia,
       * que queda escrito como un movimiento nuevo y no como si el turno nunca
       * hubiera pasado.
       */
      const turnoPorAceptar    = !!(o as any).turno_por_aceptar;
      const puede_aceptar_turno = puede_turnar && turnoPorAceptar;
      // Las mismas dos salidas de la misma disyuntiva: si se puede aceptar, se
      // puede regresar. Antes esto exigía además que el turno fuera por
      // competencia, así que un envío de información se podía aceptar pero no
      // rechazar —quedaba solo el botón de aceptar, sin alternativa—.
      const puede_devolver_turno = puede_aceptar_turno;

      // Solicitar información a otra área es más abierto que turnar, por dos
      // motivos. Uno: el analista que trabaja el oficio también puede pedirla,
      // porque es quien descubre que le falta. Dos: pedir no suelta el oficio, así
      // que sigue valiendo con el visto bueno ya dado —puede faltar un dato para
      // poder firmar—, mientras que soltarlo a esas alturas ya no.
      //
      // Antes esto se resolvía en la pantalla preguntando si el oficio era de la
      // Dirección General. Era el mismo candado que tenía el servidor, escrito
      // por segunda vez, y las dos copias tenían que quitarse a la vez.
      //
      // Y no antes de recibirlo: pedirle información a otras áreas sobre un
      // oficio que uno todavía no acepta pone el trámite de cabeza —había áreas
      // trabajando para alguien que aún podía devolverlo—.
      const puede_solicitar = o.estatus !== 'FINALIZADO'
        && !turnoPorAceptar
        && (o.dirigido_a_id === user.id
            || unidadesEncargado.includes(o.dirigido_a_unidad_id)
            || (o.abogado_id === user.id && o.abogado_unidad_id === o.dirigido_a_unidad_id));

      // La casilla «Resolución» manda el asunto a la Dirección General. No aplica
      // a lo que ya está allá, ni a lo que ya se mandó.
      const puede_marcar_resolucion = puede_turnar
        && !o.resolucion
        && o.dirigido_a_unidad_tipo !== 'DIRECCION_GENERAL';
      // La casilla «de conocimiento»: la Dirección Jurídica en cualquier oficio, y
      // en cada área quien da el visto bueno o su encargado. Solo mientras el
      // oficio no esté cerrado por firma.
      const puede_de_conocimiento = (puedeMarcarConocimiento
          || o.dirigido_a_id === user.id                        // el titular del área
          || esElAprobador
          || unidadesEncargado.includes(o.dirigido_a_unidad_id))
        && (o.de_conocimiento || o.estatus !== 'FINALIZADO');

      return {
        ...o,
        dias_restantes,
        horas_restantes,
        delegatorios_pendientes,
        puede_vobo,
        puede_finalizar,
        // Quién es, sin los frenos: para poder ofrecer la acción deshabilitada
        // con su motivo en vez de esconderla.
        es_aprobador: esElAprobador,
        puede_reconsiderar,
        bloqueo,
        puede_de_conocimiento,
        es_de_mi_area,
        en_mi_bandeja,
        soy_encargado_del_area,
        puede_corregir,
        puede_turnar,
        puede_solicitar,
        puede_aceptar_turno,
        puede_devolver_turno,
        puede_mandar_firma,
        puede_devolver_pase_firma,
        puede_marcar_resolucion,
        en_bandeja_de,
        vobo_por_nombre,
        secretaria_nombre: secretariaNombre,
      };
    });

    res.json({
      data:  oficios,
      meta:  { total, page, limit, conteos, mi_bandeja: miBandeja, de_otras_areas: deOtrasAreas },
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
      termino_tipo,
      termino_horas,
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
    // Con término hay dos formas de capturarlo, y cada una pide lo suyo. Sin tipo
    // se asume fecha, que es como se venía capturando hasta ahora.
    const porHoras = String(termino_tipo ?? '').toUpperCase() === 'HORAS';
    const horas    = Number(termino_horas);

    if (tiene_termino === true || tiene_termino === 'true') {
      if (porHoras) {
        if (!Number.isInteger(horas) || horas < 1 || horas > 24) {
          throw new AppError('Las horas del término deben ser un número de 1 a 24', 400);
        }
      } else if (!fecha_vencimiento) {
        throw new AppError(
          'fecha_vencimiento es requerida cuando tiene_termino es verdadero',
          400,
        );
      }
    }

    // ── Generar folio automático ──────────────────────────────
    //
    // Formato: {ÁREA}-{DD_MM_AAAA}-{SECUENCIA DIARIA 4 dígitos}
    // Ejemplo: DG-26_08_2026-0004
    //
    // La secuencia es GLOBAL del día, no por área: el segundo oficio que entra al
    // sistema es el 0002 aunque para su área sea el primero. Así el número dice
    // cuántos oficios entraron a la institución ese día. Antes cada área llevaba
    // su propio 0001 y ese conteo no se podía leer de un vistazo.
    //
    // Los folios emitidos con la nomenclatura anterior (OF-26082026-DG-0004) NO
    // se tocan: están impresos en acuses y en la correspondencia, y reescribirlos
    // rompería la correspondencia con el papel. Conviven los dos formatos.
    const now  = new Date();
    const dd   = String(now.getDate()).padStart(2, '0');
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const aaaa = now.getFullYear();
    const fechaFolio = `${dd}_${mm}_${aaaa}`;   // DD_MM_AAAA

    // Código de nomenclatura según el ÁREA a la que se DIRIGE/ASIGNA el oficio.
    // Con la secuencia global ya no forma parte de la identidad —la fecha y el
    // número bastan para que no se repita—, pero se conserva porque dice de un
    // vistazo a qué área entró.
    const areaDestino = await db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .where('u.id', Number(dirigido_a_id) || 0)
      .select('cu.id as unidad_id', 'cu.nombre as unidad_nombre', 'cu.codigo_folio')
      .first();

    /**
     * El código lo dice el área, ya no lo adivina el sistema.
     *
     * Aquí vivía una cadena de condiciones sobre el nombre —«si dice JURIDIC,
     * entonces DJ»— con un último recurso que armaba iniciales. Funcionaba, pero
     * ataba el alta de un área nueva a un cambio de código y un despliegue: sin su
     * renglón, sus folios salían con unas iniciales que nadie usa. Ahora es una
     * columna que se captura al crear el área.
     *
     * El `?? 'NA'` es para un caso que no debería ocurrir —la columna es
     * obligatoria—: un oficio dirigido a alguien sin unidad. Antes ese caso también
     * caía en 'NA'.
     */
    const codigo = areaDestino?.codigo_folio ?? 'NA';

    /**
     * El número se pide a la tabla `folio_secuencia`, no se calcula contando.
     *
     * Contar y sumar uno funcionaba con la numeración por área, donde cada una
     * competía solo consigo misma. Con un contador único, todas las ventanillas
     * piden el mismo número a la vez y dos capturas simultáneas obtendrían el
     * mismo folio. Este INSERT … ON CONFLICT incrementa y devuelve en una sola
     * operación: la base serializa a quien llegue segundo.
     *
     * La fecha se arma en la zona horaria de la aplicación y no con CURRENT_DATE,
     * porque la base puede estar en otra y el día cambiaría a deshora.
     */
    const fechaSql = `${aaaa}-${mm}-${dd}`;

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
      /**
       * El número del folio se toma AQUÍ DENTRO, no antes.
       *
       * Tomarlo al principio dejaba huecos: si el archivo no subía o una
       * validación rebotaba después, el número quedaba consumido y nadie lo
       * volvía a usar. Pedido dentro de la transacción, cualquier fallo posterior
       * la revierte y el contador regresa solo a donde estaba.
       *
       * Va como primera sentencia y con los archivos ya guardados fuera, para que
       * el bloqueo sobre el renglón del día dure lo que tarda un INSERT y no lo
       * que tarda una carga de varios megas.
       */
      const { rows } = await trx.raw(
        `INSERT INTO folio_secuencia (fecha, ultimo) VALUES (?, 1)
           ON CONFLICT (fecha) DO UPDATE SET ultimo = folio_secuencia.ultimo + 1
         RETURNING ultimo`,
        [fechaSql],
      );
      const folio = `${codigo}-${fechaFolio}-${String(rows[0].ultimo).padStart(4, '0')}`;

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
          // A quién va dirigido según el documento. No se vuelve a tocar: el
          // turno mueve el trabajo, no reescribe el destinatario del oficio.
          dirigido_a_original_id: dirigido_a_id ? Number(dirigido_a_id) : null,
          // El instante de vencimiento no se guarda: la base lo calcula sola a
          // partir de estos campos y de la fecha de ingreso.
          termino_tipo:         tiene_termino ? (porHoras ? 'HORAS' : 'FECHA') : null,
          termino_horas:        tiene_termino && porHoras ? horas : null,
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

    // Los correos usados quedan en la lista de quien registró, para que la
    // próxima vez los encuentre en vez de volver a teclearlos. Se guardan aquí y
    // no en un alta aparte porque este es el único momento en que se sabe cuáles
    // usa de verdad. Si falla, el oficio ya quedó guardado y no se revierte.
    if (esCorreo) {
      await Promise.all([
        recordarCorreo('ORIGEN',  cOrigen,  user.id),
        recordarCorreo('DESTINO', cDestino, user.id),
      ]);
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

/**
 * Plazo de cada etapa, en días hábiles.
 *
 * TOTAL es acumulado desde que se marca, no adicional: la Dirección General se
 * queda con la diferencia entre ambos. Hoy son 2 días para las delegaciones y 1
 * para la Dirección General, 3 en total.
 */
const TESTAMENTO_DIAS_DELEGACIONES = 2;
const TESTAMENTO_DIAS_TOTAL        = 3;

/**
 * Marca el oficio como búsqueda de testamentos y arranca sus plazos.
 *
 * Son dos etapas: 2 días hábiles para que las delegaciones seleccionadas busquen
 * y entreguen, y 1 más para que la Dirección General arme el proyecto de
 * contestación — 3 en total.
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

    const dirigido = await db('oficios').where({ id: oficio_id }).select('dirigido_a_id').first();
    if (!dirigido) throw new AppError('Oficio no encontrado', 404);
    if (!(await puedeMarcarConocimientoEn(user, dirigido.dirigido_a_id))) {
      throw new AppError('Solo quien da el visto bueno o el encargado del área pueden marcar un oficio de conocimiento', 403);
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
        // La auditoría solo dirá «FINALIZADO», que es lo mismo que se lee cuando
        // un oficio se firma. Aquí queda dicho que se cerró por informativo.
        await trx('oficio_conocimiento').insert({
          oficio_id, marcado: true, usuario_id: user.id, creado_en: new Date(),
        });
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
        await trx('oficio_conocimiento').insert({
          oficio_id, marcado: false, estatus_restaurado: previo,
          usuario_id: user.id, creado_en: new Date(),
        });
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
    // Dos razones opuestas y por eso se distinguen: o el asunto no le toca al
    // área, o sí le tocaba, ya hizo su parte y manda lo trabajado para que otra
    // continúe. Registrarlas igual dejaría el expediente contando lo contrario.
    const tipo = String(req.body?.tipo ?? 'COMPETENCIA').toUpperCase() === 'INFORMACION'
      ? 'INFORMACION' : 'COMPETENCIA';
    // La casilla «Resolución» usa este mismo envío; solo deja dicho de qué se
    // trataba, para poder distinguirlos después sin leer el oficio.
    const esResolucion = req.body?.resolucion === true || req.body?.resolucion === 'true';

    if (!destinoId) throw new AppError('Selecciona el área a la que se turna', 422);
    if (!motivo)    throw new AppError(
      tipo === 'INFORMACION'
        ? 'Explica qué información se envía y hasta dónde trabajó tu área'
        : 'Indica por qué se turna a esa área', 422);
    if (tipo === 'INFORMACION' && !req.file) {
      throw new AppError('Adjunta el documento con lo que trabajó tu área', 422);
    }

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

    // Lo turna quien responde por el área: su titular —delegado o director— o el
    // encargado de oficios. Antes solo el encargado, y como en la mayoría de las
    // áreas el jefe no lo es, ninguna delegada podía turnar sus propios oficios.
    const esEncargado = await db('configuracion_flujos')
      .where({
        modulo_clave: 'oficialia_partes',
        rol_flujo:    'ENCARGADO',
        usuario_id:   user.id,
        unidad_id:    actual.unidad_actual ?? -1,
      })
      .first();
    const esTitular = actual.dirigido_a_id === user.id;
    if (!esEncargado && !esTitular) {
      throw new AppError('Solo el titular del área o su encargado pueden turnar este oficio', 403);
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

    // Fuera de la transacción, igual que en el resto del módulo: si el guardado
    // del archivo falla, no se alcanzó a mover nada.
    const documentoUrl = req.file
      ? (await storage.saveWithInfo(req.file, 'oficios/turnos')).url
      : null;

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
        tipo,
        documento_url:        documentoUrl,
        turnado_por_id:       user.id,
        creado_en:            new Date(),
      });

      // El flujo arranca de cero en la nueva área.
      await trx('oficios').where({ id: oficio_id }).update({
        dirigido_a_id: titular.id,
        estatus:       'RECIBIDO' as EstatusOficio,
        ...(esResolucion ? { resolucion: true, resolucion_en: new Date() } : {}),
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
/**
 * El turno que trajo el oficio al área donde está hoy, si sigue sin aceptarse.
 *
 * Recibir es un acto explícito: mientras esto devuelva algo, el área todavía
 * puede regresar el oficio a quien se lo mandó. Aceptado, la única salida es
 * turnarlo de nuevo por no competencia, que queda escrito como un movimiento
 * nuevo en vez de deshacer el que ya ocurrió.
 */
async function turnoPorAceptar(oficioId: number, unidadActual: number | null, trx: any = db) {
  if (!unidadActual) return null;
  return trx('oficio_turnos')
    .where({ oficio_id: oficioId, unidad_destino_id: unidadActual })
    .whereNull('aceptado_en')
    .andWhere('es_devolucion', false)
    .orderBy('id', 'desc')
    .first();
}

/**
 * Marca como aceptado el turno abierto del área, si lo hay.
 *
 * Se llama también desde asignar: repartir el oficio entre su gente ya es
 * tomarlo, y obligar a pulsar «Aceptar» antes sería un paso de más para decir lo
 * que la acción anterior ya dijo.
 */
async function aceptarTurnoSiAbierto(
  oficioId: number, unidadActual: number | null, userId: number, trx: any = db,
): Promise<boolean> {
  const turno = await turnoPorAceptar(oficioId, unidadActual, trx);
  if (!turno) return false;
  await trx('oficio_turnos').where({ id: turno.id })
    .update({ aceptado_en: new Date(), aceptado_por_id: userId });

  /**
   * Aceptado un cambio de competencia, el proyecto de la otra área se borra.
   *
   * El área anterior dijo «esto nunca fue mío»; su borrador y su visto bueno
   * dejaron de significar algo, y arrastrarlos hacía que la nueva heredara un
   * proyecto ajeno como si fuera propio —con el riesgo de firmar un documento
   * que su área no redactó—.
   *
   * Se borra **al aceptar** y no al turnar, a propósito: si el destino lo
   * regresara con «Reconsiderar petición», el oficio vuelve al origen y su
   * trabajo tiene que seguir ahí. La aceptación es el punto sin retorno.
   *
   * En «Envío de información» no se toca: ahí mandar lo trabajado es justamente
   * el objeto del envío.
   */
  if (turno.tipo === 'COMPETENCIA' && !turno.es_devolucion) {
    const gestion = await trx('gestiones_contestacion').where({ oficio_id: oficioId }).first();
    if (gestion?.proyecto_url) {
      await trx('gestiones_contestacion').where({ oficio_id: oficioId }).update({
        proyecto_url:   null,
        texto_proyecto: null,
        vobo_encargado: false,
        fecha_vobo:     null,
        // El área nueva empieza a contar desde su primera versión, no desde la
        // que dejó la anterior.
        version_proyecto: 0,
      });
      try { storage.delete(gestion.proyecto_url); }
      catch (err) { logger.error({ err, oficio_id: oficioId }, 'No se pudo borrar el proyecto al aceptar el cambio de competencia'); }
    }
  }

  return true;
}

/**
 * PATCH /oficios/:id/turnar/aceptar
 *
 * El área recibe formalmente un oficio que le turnaron. No mueve el flujo —el
 * oficio sigue en RECIBIDO, esperando que lo asignen—; lo que hace es cerrar la
 * posibilidad de regresarlo, y dejar constancia de quién lo tomó y cuándo.
 */
export async function aceptarTurno(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const user      = req.user!;
    const oficio_id = parseInt(req.params.id, 10);

    const actual = await db('oficios as o')
      .leftJoin('usuarios as u', 'u.id', 'o.dirigido_a_id')
      .where('o.id', oficio_id)
      .select('o.id', 'o.dirigido_a_id', 'u.unidad_id as unidad_actual')
      .first();
    if (!actual) throw new AppError('Oficio no encontrado', 404);

    // Acepta quien responde por el área: su titular o su encargado. Recibir
    // compromete al área entera, no solo a quien lo vaya a trabajar.
    const esEncargado = await db('configuracion_flujos')
      .where({
        modulo_clave: 'oficialia_partes',
        rol_flujo:    'ENCARGADO',
        usuario_id:   user.id,
        unidad_id:    actual.unidad_actual ?? -1,
      })
      .first();
    if (!esEncargado && actual.dirigido_a_id !== user.id) {
      throw new AppError('Solo el titular del área o su encargado pueden aceptar el oficio', 403);
    }

    const aceptado = await db.transaction(async (trx) =>
      aceptarTurnoSiAbierto(oficio_id, actual.unidad_actual, user.id, trx));
    if (!aceptado) throw new AppError('Este oficio no tiene un turno pendiente de aceptar', 409);

    res.json({ message: 'Oficio aceptado' });
  } catch (err) { next(err); }
}

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

    // Solo mientras el área no lo haya aceptado. Devolver deja el oficio en
    // RECIBIDO en el área de origen, así que hacerlo con el trabajo ya hecho
    // dejaba huérfanos el proyecto y el visto bueno, y el expediente terminaba
    // diciendo que esta área nunca lo tomó. Después de aceptar, la salida es
    // turnarlo por no competencia: un movimiento nuevo, con su justificación.
    if (!(await turnoPorAceptar(oficio_id, actual.unidad_actual))) {
      throw new AppError(
        'Tu área ya aceptó este oficio. Si no le compete, túrnalo a la que corresponda desde «Turnar a otra área».',
        409,
      );
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

    /**
     * Y que sea analista designado en alguna de las áreas de las que puede salir
     * el reparto de ESTE oficio: la suya, o una que el encargado dirija.
     *
     * El desplegable ya solo ofrece esos, pero eso es la pantalla; esta es la
     * regla. Sin ella, una lista vieja en el navegador —o una llamada hecha a
     * mano— vuelve a dejar el oficio con alguien que no tiene por qué trabajarlo.
     *
     * Se valida antes de abrir la transacción: nada que revertir si no procede.
     */
    const unidadesValidas = await unidadesParaAsignar(user, oficio_id);
    const designado = unidadesValidas.length
      ? await db('configuracion_flujos')
          .where({
            modulo_clave: 'oficialia_partes',
            rol_flujo:    'JURIDICO',
            usuario_id:   abogado_id,
          })
          .whereIn('unidad_id', unidadesValidas)
          .first()
      : null;
    if (!designado) {
      throw new AppError(
        `${abogado.nombre} no está designado como analista jurídico en este oficio ni en las áreas que diriges. `
        + 'Desígnalo en Configuración de Flujos, o asigna a alguien que sí lo esté.',
        422,
      );
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

      // Si llegó turnado y nadie lo había aceptado, repartirlo entre su gente ya
      // es tomarlo: exigir un «Aceptar» previo sería un paso de más para decir lo
      // que esta acción acaba de decir.
      //
      // El área sale del destinatario del oficio y no del abogado: son la misma
      // casi siempre, pero la que manda es dónde vive el oficio.
      await aceptarTurnoSiAbierto(oficio_id, await unidadDelOficio(oficio_id, trx), user.id, trx);

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
        // El proyecto se sobrescribe: no se guardan versiones anteriores, así que
        // el archivo viejo se borra en vez de quedarse huérfano en disco. Antes
        // se perdía la referencia pero el PDF seguía ahí, acumulándose.
        const anterior = gestionExistente.proyecto_url;
        await trx('gestiones_contestacion')
          .where({ oficio_id })
          .update({ proyecto_url, texto_proyecto, version_proyecto: version, vobo_encargado: false });
        if (anterior && anterior !== proyecto_url) {
          try { storage.delete(anterior); }
          catch (err) { logger.error({ err, oficio_id }, 'No se pudo borrar el proyecto anterior'); }
        }
      } else {
        await trx('gestiones_contestacion').insert({
          oficio_id, proyecto_url, texto_proyecto,
          version_proyecto: version, vobo_encargado: false,
        });
      }

      await trx('oficios')
        .where({ id: oficio_id })
        .update({
          estatus: 'EN_REVISION' as EstatusOficio,
          // La vuelta terminó: la siguiente reconsideración decidirá de nuevo a
          // quién le cae.
          reconsideracion_al_encargado: false,
        });

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

    // Más amplio que el visto bueno: además de quien aprueba, el titular del área
    // —la Directora General en lo suyo— y quien tiene la carga del firmado.
    const oficioAuth = await db('oficios').where({ id: oficio_id }).select('dirigido_a_id').first();
    if (!oficioAuth) throw new AppError('Oficio no encontrado', 404);
    if (!(await puedeReconsiderarOficio(user, oficioAuth.dirigido_a_id, oficio_id))) {
      throw new AppError('No estás autorizado para solicitar correcciones de este oficio', 403);
    }

    /**
     * ¿A quién le cae de vuelta?
     *
     * Si quien regresa el oficio es el aprobador del área, la corrección es sobre
     * el trabajo de su propio equipo y baja al analista que lo redactó. Si viene
     * de más arriba —la Directora General, la carga del firmado—, el oficio venía
     * ya aprobado, así que el que tiene que responder es el encargado que lo
     * aprobó y lo mandó; él verá si lo corrige o se lo devuelve a su gente.
     *
     * Bajar siempre al analista le dejaba una observación que no le tocaba
     * atender, y el encargado ni se enteraba de que le habían rechazado lo suyo.
     */
    const alEncargado = !(await puedeAprobarOficio(user, oficioAuth.dirigido_a_id));

    if (!comentario?.trim()) {
      throw new AppError('El comentario de corrección es obligatorio', 400);
    }

    await db.transaction(async (trx) => {
      const oficio = await getOficioOrFail(trx, oficio_id);

      // VOBO_APROBADO también entra: un oficio que la Dirección General regresó de
      // firma ya trae el visto bueno dado, y aun así hay que devolvérselo al jurídico
      // que redactó la contestación. Si estaba esperando firma, primero se regresa.
      // EN_RECONSIDERACION queda fuera: ya está regresado, y volver a regresarlo
      // solo reescribiría la observación anterior sin mover nada.
      if (!['EN_REVISION', 'VOBO_APROBADO'].includes(oficio.estatus)) {
        throw new AppError(
          `El oficio debe estar EN_REVISION para solicitar reconsideración (estatus: ${oficio.estatus})`,
          422,
        );
      }
      if (oficio.estatus === 'VOBO_APROBADO' && await enPaseFirma(oficio_id, trx)) {
        throw new AppError(
          'Este oficio está esperando la firma del Despacho de la Titular. Pídele que lo regrese antes de mandarlo a corregir.',
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
        .update({
          estatus: 'EN_RECONSIDERACION' as EstatusOficio,
          reconsideracion_al_encargado: alEncargado,
        });

      await createAuditLog(trx, oficio_id, oficio.estatus, 'EN_RECONSIDERACION', user.id);
    });

    res.json({
      message: alEncargado
        ? 'Regresado al encargado del área con tus comentarios.'
        : 'Reconsideración solicitada. El jurídico recibirá los comentarios.',
    });
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

// ─── PATCH /oficios/:id/datos ────────────────────────────────────────────────

/**
 * Campos de captura que se pueden corregir, con su nombre para el historial.
 *
 * Quedan FUERA a propósito:
 *
 *  · El término y la fecha de vencimiento. Mueven un plazo legal y quien está
 *    trabajando el oficio no se enteraría de que le cambiaron el reloj.
 *  · «Dirigido a». Cambia el oficio de área, que es exactamente lo que hace
 *    turnar; tener dos caminos para lo mismo deja la trazabilidad partida.
 *  · El estatus. Se mueve con las acciones del flujo, no a mano.
 */
const CAMPOS_CORREGIBLES: Record<string, string> = {
  remitente:            'Remitente',
  dependencia_origen:   'Dependencia',
  unidad_interna:       'Unidad interna',
  numero_oficio_origen: 'N.º de oficio de origen',
  fecha_oficio:         'Fecha del oficio',
  descripcion_solicitud:'Asunto',
  correo_origen:        'Correo de origen',
};

/** Estos campos se guardan en mayúsculas al registrar; la corrección hace igual. */
const CAMPOS_MAYUSCULAS = new Set([
  'remitente', 'dependencia_origen', 'unidad_interna', 'numero_oficio_origen',
]);

/**
 * Corrige los datos que capturó la oficialía al registrar el oficio.
 *
 * Antes no había manera: un dedazo en el remitente obligaba a descartar el
 * registro y volver a capturar, quemando un folio.
 *
 * Quién puede: quien pertenece al área donde vive el oficio —su titular, el
 * encargado y su equipo—, más el encargado configurado de esa unidad aunque esté
 * adscrito a otra, que es el caso de la Dirección General.
 *
 * Hasta cuándo: mientras no esté FINALIZADO. Después el documento ya salió
 * firmado, y corregir el remitente ahí reescribiría lo que dice un papel que ya
 * está en manos de la autoridad que lo pidió.
 *
 * Cada campo que cambia deja su renglón en el historial con el antes y el
 * después: sobre un expediente oficial, una corrección silenciosa es peor que no
 * poder corregir.
 */
export async function corregirDatosOficio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user      = req.user!;
    const oficio_id = parseInt(req.params.id, 10);

    const oficio = await db('oficios as o')
      .leftJoin('usuarios as dir', 'dir.id', 'o.dirigido_a_id')
      .where('o.id', oficio_id)
      .select('o.*', 'dir.unidad_id as dirigido_a_unidad_id')
      .first();
    if (!oficio) throw new AppError('Oficio no encontrado', 404);

    if (oficio.estatus === 'FINALIZADO') {
      throw new AppError(
        'El oficio ya está finalizado: sus datos no se pueden corregir porque el documento salió firmado.',
        409,
      );
    }

    const unidadesEncargado = await getUnidadesEncargado(user.id);
    const esDelArea = user.oficina_id === oficio.dirigido_a_unidad_id
      || unidadesEncargado.includes(oficio.dirigido_a_unidad_id);
    if (!esDelArea) {
      throw new AppError('Solo el área que tiene el oficio puede corregir sus datos', 403);
    }

    // Se comparan solo los campos que vengan en la petición: mandar el resto
    // vacío no debe borrar lo que ya estaba.
    const cambios: { campo: string; antes: string | null; despues: string | null }[] = [];
    const update: Record<string, any> = {};

    for (const campo of Object.keys(CAMPOS_CORREGIBLES)) {
      if (!(campo in req.body)) continue;

      const crudo = req.body[campo];
      let nuevo: string | null =
        crudo === null || crudo === undefined || String(crudo).trim() === ''
          ? null
          : String(crudo).trim();
      if (nuevo && CAMPOS_MAYUSCULAS.has(campo)) nuevo = nuevo.toUpperCase();

      const anterior = oficio[campo] === undefined || oficio[campo] === null
        ? null
        : String(oficio[campo] instanceof Date
            ? oficio[campo].toISOString().slice(0, 10)
            : oficio[campo]);

      if (nuevo === anterior) continue;   // sin cambio real, no ensucia el historial
      update[campo] = nuevo;
      cambios.push({ campo, antes: anterior, despues: nuevo });
    }

    if (cambios.length === 0) {
      res.json({ message: 'No hubo cambios que guardar', data: { cambios: 0 } });
      return;
    }

    await db.transaction(async (trx) => {
      await trx('oficios').where({ id: oficio_id }).update(update);
      await trx('oficio_correcciones').insert(
        cambios.map((c) => ({
          oficio_id,
          campo:          c.campo,
          valor_anterior: c.antes,
          valor_nuevo:    c.despues,
          usuario_id:     user.id,
        })),
      );
    });

    res.json({
      message: cambios.length === 1
        ? 'Se corrigió 1 dato del oficio'
        : `Se corrigieron ${cambios.length} datos del oficio`,
      data: { cambios: cambios.length },
    });
  } catch (err) { next(err); }
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
      .leftJoin('usuarios as acep', 'acep.id', 't.aceptado_por_id')
      .where('t.oficio_id', oficio_id)
      .select(
        't.id', 't.motivo', 't.estatus_previo', 't.creado_en', 't.es_devolucion', 't.tipo',
        't.aceptado_en',
        'u.nombre as usuario_nombre',
        'acep.nombre as aceptado_por',
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
          ? `A firma del Despacho de la Titular: ${p.motivo}`
          : 'A firma del Despacho de la Titular',
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

    // A quién se le asignó el oficio y quién lo asignó. La auditoría solo dice
    // que pasó a ASIGNADO, no en manos de quién quedó — que es justo lo que hace
    // falta para seguirle la pista cuando el oficio se mueve entre áreas.
    const asignaciones = await db('asignaciones_juridicas as a')
      .join('usuarios as ab', 'ab.id', 'a.abogado_id')
      .leftJoin('usuarios as por', 'por.id', 'a.asignado_por_id')
      .where('a.oficio_id', oficio_id)
      .select('a.id', 'a.fecha_asignacion', 'a.observaciones',
              'ab.nombre as abogado', 'por.nombre as asignado_por')
      .orderBy('a.id', 'asc');

    // Correcciones a los datos de captura: tampoco cambian el estatus, así que
    // viven en su propia tabla igual que los turnos y los pases de firma.
    const correcciones = await db('oficio_correcciones as c')
      .join('usuarios as u', 'u.id', 'c.usuario_id')
      .where('c.oficio_id', oficio_id)
      .select('c.id', 'c.campo', 'c.valor_anterior', 'c.valor_nuevo', 'c.corregido_en',
              'u.nombre as usuario_nombre')
      .orderBy('c.id', 'asc');

    // Cada vez que se marcó o se quitó la marca de conocimiento.
    const conocimiento = await db('oficio_conocimiento as k')
      .join('usuarios as u', 'u.id', 'k.usuario_id')
      .where('k.oficio_id', oficio_id)
      .select('k.id', 'k.marcado', 'k.estatus_restaurado', 'k.creado_en', 'u.nombre as usuario_nombre')
      .orderBy('k.id', 'asc');

    const historial = [
      ...estados,
      ...eventosPase,
      ...asignaciones.map((a: any) => ({
        // Rango propio de ids negativos, para no chocar con las otras fuentes.
        id:              -3000000 - a.id,
        estado_anterior: null,
        estado_nuevo:    'ASIGNACION',
        fecha_cambio:    a.fecha_asignacion,
        usuario_nombre:  a.asignado_por ?? '—',
        detalle:         a.observaciones
          ? `Asignado a ${a.abogado}: ${a.observaciones}`
          : `Asignado a ${a.abogado}`,
      })),
      ...conocimiento.map((k: any) => ({
        id:              -4000000 - k.id,
        estado_anterior: null,
        estado_nuevo:    k.marcado ? 'DE_CONOCIMIENTO' : 'CONOCIMIENTO_QUITADO',
        fecha_cambio:    k.creado_en,
        usuario_nombre:  k.usuario_nombre,
        detalle:         k.marcado
          ? 'Marcado de conocimiento: se cierra sin contestación ni firma'
          : `Se quitó la marca de conocimiento; el oficio regresó a ${k.estatus_restaurado ?? 'su punto anterior'}`,
      })),
      /**
       * Correcciones a los datos de captura. Van con el antes y el después
       * explícitos: decir solo «se editó el oficio» dejaría al expediente sin
       * manera de saber qué decía antes, que es justo lo que se necesita cuando
       * alguien pregunta por un dato que ya no coincide con el papel.
       */
      ...correcciones.map((c: any) => ({
        id:              -5000000 - c.id,
        estado_anterior: null,
        estado_nuevo:    'CORRECCION',
        fecha_cambio:    c.corregido_en,
        usuario_nombre:  c.usuario_nombre,
        detalle:         `Corrigió ${CAMPOS_CORREGIBLES[c.campo] ?? c.campo}: `
                       + `«${c.valor_anterior ?? '—'}» → «${c.valor_nuevo ?? '—'}»`,
      })),
      /**
       * Los cambios de área dicen con qué opción se hicieron.
       *
       * «Turnado a otra área» a secas no distinguía entre mandar lo trabajado y
       * deslindarse del asunto, que son cosas opuestas y quedaban idénticas en el
       * expediente. Ahora cada movimiento sale con el nombre de la opción que se
       * eligió —lo pone el rótulo del evento, no el texto del renglón, para no
       * decirlo dos veces—. Y la aceptación tampoco aparecía en ningún lado,
       * aunque es el momento en que el área se hace responsable.
       */
      ...turnos.flatMap((t: any) => {
        const ruta = `${t.origen ?? 'Sin área'} → ${t.destino}`;
        const movimiento = {
          // Id negativo y desplazado para no chocar con auditoría ni delegatorios.
          id:              -1000000 - t.id,
          estado_anterior: t.estatus_previo,
          estado_nuevo:    t.es_devolucion ? 'DEVUELTO'
                            : t.tipo === 'INFORMACION' ? 'INFORMACION_ENVIADA' : 'TURNADO',
          fecha_cambio:    t.creado_en,
          usuario_nombre:  t.usuario_nombre,
          detalle:         `${ruta}: ${t.motivo}`,
        };
        // La aceptación va como su propio renglón: es un acto de otra persona, en
        // otro momento, y meterlo en el mismo dejaría dos autores en una línea.
        if (!t.aceptado_en || t.es_devolucion) return [movimiento];
        return [movimiento, {
          id:              -3000000 - t.id,
          estado_anterior: null,
          estado_nuevo:    'TURNO_ACEPTADO',
          fecha_cambio:    t.aceptado_en,
          usuario_nombre:  t.aceptado_por ?? 'El área destino',
          detalle:         `${t.destino} se hizo cargo del oficio`,
        }];
      }),
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

    // Quién puede recibir un oficio para trabajarlo: quien esté DESIGNADO como
    // analista jurídico de esta área en Configuración de Flujos.
    //
    // Antes se deducía —misma unidad, módulo habilitado, rol operativo y no ser
    // oficial ni encargado—, así que bastaba habilitarle el módulo a alguien para
    // que empezara a aparecer en el reparto, y la función capturada no cambiaba
    // nada. Ahora la designación es explícita y por unidad: si el desplegable sale
    // vacío es que a esa área todavía no se le han designado analistas.
    //
    // Ser oficial de partes NO excluye: una misma persona puede recepcionar y
    // además trabajar expedientes, que en las delegaciones chicas pasa a diario.
    // Sí se excluye al encargado, que reparte el trabajo en vez de recibirlo.
    //
    // ── De qué áreas se listan ─────────────────────────────────────────────
    //
    // Del área del oficio Y de las que dirige quien reparte. Se filtraba solo por
    // `user.oficina_id`, y eso vale mientras el encargado esté adscrito al área
    // que dirige. Óscar Gopar no lo está: figura en la Dirección Jurídica y es
    // encargado además de la Dirección General.
    //
    // Las dos mitades hacen falta:
    //
    //   · El área del oficio, porque el trabajo es de esa área.
    //   · Las áreas que él dirige, porque un encargado reparte con SU equipo, y
    //     la Dirección General no tiene analistas propios: los suyos están en
    //     Jurídica. Sin esto, ese desplegable sale vacío y sus 35 oficios en
    //     RECIBIDO no tienen a quién ir.
    //
    // No se abre a nadie más: solo áreas de las que él responde.
    const oficioId = req.query.oficio_id ? Number(req.query.oficio_id) : null;
    const unidadesCandidatas = await unidadesParaAsignar(user, oficioId);
    // Se resuelve aparte y no como `unidadesCandidatas[0]`: que el área del
    // oficio vaya primera en ese arreglo es cierto hoy, pero es orden de
    // inserción, no una promesa. Aquí sí importa cuál es, para encabezar la lista.
    const unidadDelPropioOficio = oficioId ? await unidadDelOficio(oficioId) : null;

    const candidatos = await db('usuarios as u')
      .join('configuracion_flujos as cf', function () {
        this.on('cf.usuario_id', 'u.id')
            .andOnVal('cf.modulo_clave', 'oficialia_partes')
            .andOnVal('cf.rol_flujo', 'JURIDICO');
      })
      // El módulo habilitado sigue siendo requisito, aunque la designación sea
      // explícita: sin acceso al módulo la persona no puede abrir el oficio, y
      // asignárselo lo dejaría varado sin que nadie lo note.
      .join('usuario_modulos as um', 'um.usuario_id', 'u.id')
      .join('modulos as m', function () {
        this.on('m.id', 'um.modulo_id').andOnVal('m.clave', 'oficialia_partes');
      })
      // El área de la DESIGNACIÓN, no la de adscripción de la persona. Es la que
      // dice de qué equipo se está echando mano, que es lo que la pantalla agrupa.
      .join('catalogo_unidades as cu', 'cu.id', 'cf.unidad_id')
      .whereIn('cf.unidad_id', unidadesCandidatas)
      .andWhere('u.activo', true)
      .andWhereNot('u.id', user.id)
      .whereNotExists(function () {
        this.select('*')
          .from('configuracion_flujos as cf2')
          .whereRaw('cf2.usuario_id = u.id')
          .andWhere('cf2.modulo_clave', 'oficialia_partes')
          .where('cf2.rol_flujo', 'ENCARGADO');
      })
      // El área del oficio primero: es de donde debería salir el analista, y las
      // demás son el equipo prestado. Que encabece la lista lo dice sin explicarlo.
      //
      // El criterio va como columna y no directo en el ORDER BY porque con
      // SELECT DISTINCT Postgres exige que toda expresión ordenada esté en la
      // lista de selección.
      .distinct(
        'u.id', 'u.nombre', 'u.cargo', 'u.email',
        'cf.unidad_id', 'cu.nombre as oficina_nombre',
        db.raw('CASE WHEN cf.unidad_id = ? THEN 0 ELSE 1 END AS orden_area', [unidadDelPropioOficio ?? 0]),
      )
      .orderBy('orden_area', 'asc')
      .orderBy('cu.nombre', 'asc')
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

      // Solo EN_REVISION. En reconsideración el turno es de quien tiene que
      // corregir, y aprobar ahí daría por bueno el proyecto que se acaba de
      // rechazar: el visto bueno vuelve a tener sentido cuando suban la versión
      // corregida y el oficio regrese a revisión.
      if (oficio.estatus !== 'EN_REVISION') {
        throw new AppError(
          `El oficio debe estar EN_REVISION para otorgar el VoBo (estatus actual: ${oficio.estatus})`,
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

      /**
       * Con el firmado de por medio, el proyecto de contestación deja de tener
       * razón de ser: lo que vale es el documento firmado, y el borrador solo
       * ocupa espacio y se presta a que alguien lo confunda con lo oficial.
       *
       * Se borra el archivo y se suelta la referencia. El historial conserva
       * quién lo redactó, cuándo y quién le dio el visto bueno.
       */
      const gestion = await trx('gestiones_contestacion').where({ oficio_id }).first();

      await trx('gestiones_contestacion')
        .where({ oficio_id })
        .update({
          escaneo_firmado_url,
          subido_por_secretaria_id: user.id,
          proyecto_url: null,
        });

      if (gestion?.proyecto_url) {
        try { storage.delete(gestion.proyecto_url); }
        catch (err) { logger.error({ err, oficio_id }, 'No se pudo borrar el proyecto al firmar'); }
      }

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

// ─── GET /oficios/responsables ───────────────────────────────────────────────

/**
 * Quiénes pueden tener un oficio en su bandeja, para el filtro de monitoreo.
 *
 * No es la lista de usuarios del sistema: son los que participan en el flujo
 * —encargados, analistas jurídicos, titulares de área y la secretaría—, que son
 * los únicos nombres que llegan a aparecer en la columna «En bandeja de».
 */
export async function listarResponsables(
  _req: Request, res: Response, next: NextFunction,
): Promise<void> {
  try {
    const enFlujos = db('configuracion_flujos')
      .where('modulo_clave', 'oficialia_partes')
      .whereIn('rol_flujo', ['ENCARGADO', 'JURIDICO', 'SECRETARIA'])
      .whereNotNull('usuario_id')
      .select('usuario_id');

    const filas = await db('usuarios as u')
      .leftJoin('catalogo_unidades as cu', 'cu.id', 'u.unidad_id')
      .where('u.activo', true)
      .andWhere((q) => {
        q.whereIn('u.id', enFlujos)
         // Los titulares de área: el oficio les cae a ellos aunque no estén
         // configurados en flujos.
         .orWhere((q2) => {
           q2.where('u.rol', 'DIRECTOR').whereNotNull('u.unidad_id');
         });
      })
      .select('u.id', 'u.nombre', 'u.cargo', 'cu.nombre as area')
      .orderBy('cu.nombre', 'asc')
      .orderBy('u.nombre', 'asc');

    res.json({ data: filas });
  } catch (err) { next(err); }
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
      throw new AppError('Este oficio ya está esperando la firma del Despacho de la Titular', 409);
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

    res.json({ message: 'El oficio quedó en espera de la firma del Despacho de la Titular' });
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
    // La Directora General y quienes tienen la carga del firmado: los mismos que
    // pueden cerrarlo. Quien puede firmar un oficio tiene que poder negarse.
    if (!(await puedeCerrarPaseFirma(user))) {
      throw new AppError('Solo la Dirección General puede regresar un oficio que está a firma', 403);
    }

    const pase = await db('oficio_pases_firma')
      .where({ oficio_id })
      .whereNull('cerrado_en')
      .first();
    if (!pase) throw new AppError('Este oficio no está esperando firma del Despacho de la Titular', 409);

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
