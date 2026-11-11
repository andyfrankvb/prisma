/**
 * Visibilidad de oficios — quién puede ver cuál
 * File: src/modules/oficialia_partes/oficios.visibilidad.ts
 *
 * La bandeja (`listarOficios`) decide por rol qué oficios ve cada persona. Esa
 * decisión vivía únicamente ahí, aplicada como filtros sobre la consulta de la
 * lista, y por eso los endpoints que entregan un oficio POR ID no la aplicaban:
 * servían el archivo a cualquiera con sesión válida.
 *
 * Este módulo responde la misma pregunta para UN oficio concreto, con las mismas
 * reglas y los mismos predicados SQL, para que la respuesta no dependa de por
 * qué puerta se entre.
 *
 * ── Por qué los predicados viven aquí ─────────────────────────────────────────
 *
 * `oficios.controller.ts` ya documenta en su propio código lo que pasa cuando la
 * misma regla se escribe varias veces: «Vivía escrito dos veces —en OPERATIVO y
 * en el default— y una tercera versión sin la última condición en JURIDICO. Tres
 * copias de la misma regla es como se desincronizan las cosas». Los predicados
 * se exportan desde aquí para que la bandeja y esta verificación puedan usar
 * exactamente el mismo texto SQL.
 */

import { db }       from '../../db';
import type { AuthUser, RolUsuario } from './oficios.types';

/** Lista de unidades para un `IN (...)`. Sin unidades, `IN (NULL)` nunca es cierto. */
function listaUnidades(unidades: number[]): string {
  return unidades.length ? unidades.map(Number).join(',') : 'NULL';
}

/** Oficios que alguna de estas unidades turnó a otra (sin contar traslados por competencia). */
export function sqlEnviadoPor(unidades: number[]): string {
  return `EXISTS (SELECT 1 FROM oficio_turnos ts
                   WHERE ts.oficio_id = oficios.id
                     AND ts.unidad_origen_id IN (${listaUnidades(unidades)})
                     AND ts.tipo <> 'COMPETENCIA')`;
}

/** Oficios sobre los que otra área le pidió información a alguna de estas unidades. */
export function sqlConSolicitud(unidades: number[]): string {
  return `EXISTS (SELECT 1 FROM oficio_delegatorios ds
                   WHERE ds.oficio_id = oficios.id
                     AND ds.unidad_destino_id IN (${listaUnidades(unidades)}))`;
}

/**
 * Oficios asignados a este analista que todavía le tocan.
 *
 * Un turnado posterior a la asignación la caduca: el oficio se movió a otra área
 * y deja de ser suyo. Si se fue y volvió, también caduca —el turnado de regreso
 * es posterior igual— y el encargado lo reparte de nuevo.
 */
export function sqlTengoAsignado(userId: number): string {
  return `EXISTS (
    SELECT 1
      FROM (
        SELECT DISTINCT ON (oficio_id) oficio_id, abogado_id, fecha_asignacion
          FROM asignaciones_juridicas
         ORDER BY oficio_id, id DESC
      ) AS ua
     WHERE ua.oficio_id  = oficios.id
       AND ua.abogado_id = ${Number(userId)}
       AND NOT EXISTS (
         SELECT 1 FROM oficio_turnos t
          WHERE t.oficio_id = ua.oficio_id
            AND t.creado_en > ua.fecha_asignacion
       )
  )`;
}

/**
 * Oficios ajenos sobre los que esta persona tiene una solicitud abierta que
 * contestar. El expediente no es suyo; la información que le pidieron, sí.
 */
export function sqlSolicitudAsignadaAMi(userId: number): string {
  return `EXISTS (
    SELECT 1 FROM oficio_delegatorios dmia
     WHERE dmia.oficio_id = oficios.id
       AND dmia.asignado_a_id = ${Number(userId)}
       AND dmia.estado IN ('PENDIENTE','ASIGNADO','EN_REVISION')
  )`;
}

/**
 * Unidades de las que el usuario es ENCARGADO configurado. El encargado recibe
 * los oficios cuyo «dirigido a» pertenece a alguna de estas unidades.
 */
export async function getUnidadesEncargado(userId: number): Promise<number[]> {
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
 * ¿Este usuario puede ver este oficio?
 *
 * Replica, para un solo id, el alcance que `listarOficios` aplica a la bandeja.
 * Devuelve `false` tanto si el oficio no existe como si existe y queda fuera del
 * alcance; quien llama decide qué código HTTP corresponde.
 *
 * Deliberadamente NO es más estricta que la bandeja: si alguien ve el renglón en
 * su lista, tiene que poder abrir el documento. Ser más estricta aquí rompería el
 * trabajo de quien sí tiene derecho a verlo.
 */
export async function puedeVerOficio(user: AuthUser, oficioId: number): Promise<boolean> {
  if (!Number.isInteger(oficioId)) return false;

  const unidadesEncargado = await getUnidadesEncargado(user.id);
  const esEncargadoFlujo  = unidadesEncargado.length > 0;

  // El join a `usuarios as dir_u` es el único que los predicados necesitan:
  // `scopeEncargado` filtra por la unidad de la persona a quien va dirigido.
  let query = db('oficios')
    .leftJoin('usuarios as dir_u', 'dir_u.id', 'oficios.dirigido_a_id')
    .where('oficios.id', oficioId);

  const scopeEncargado = (q: typeof query): typeof query =>
    q.where((sub) => {
      sub.whereIn('dir_u.unidad_id', unidadesEncargado)
         .orWhereRaw(sqlEnviadoPor(unidadesEncargado))
         .orWhereRaw(sqlConSolicitud(unidadesEncargado));
    });

  const TENGO_ASIGNADO          = sqlTengoAsignado(user.id);
  const SOLICITUD_ASIGNADA_A_MI = sqlSolicitudAsignadaAMi(user.id);

  // Ser ENCARGADO configurado tiene PRIORIDAD sobre el rol de sistema, igual que
  // en la bandeja: ve lo dirigido a su(s) unidad(es) aunque su rol sea otro.
  if (esEncargadoFlujo) {
    query = scopeEncargado(query);
  } else switch (user.rol as RolUsuario) {
    case 'OFICIAL':
      query = query
        .where('oficios.unidad_registro_id', user.oficina_id)
        .andWhere('oficios.oficial_registro_id', user.id);
      break;

    case 'OPERATIVO': {
      // Híbrido: con asignaciones actúa como JURIDICO; sin ellas, como OFICIAL.
      // En ambos casos se suman los expedientes ajenos donde le pidieron informes.
      const asignacionOperativo = await db('asignaciones_juridicas')
        .where({ abogado_id: user.id })
        .first();

      query = query.where((sub) => {
        if (asignacionOperativo) {
          sub.whereRaw(TENGO_ASIGNADO);
        } else {
          sub.where((reg) => {
            reg.where('oficios.unidad_registro_id', user.oficina_id)
               .andWhere('oficios.oficial_registro_id', user.id);
          });
        }
        sub.orWhereRaw(SOLICITUD_ASIGNADA_A_MI);
      });
      break;
    }

    case 'ENCARGADO':
      // Encargado nativo sin configuración de flujo: la bandeja no le aplica
      // filtro y ve todo. Se reproduce igual a propósito —ver más estricto aquí
      // le quitaría archivos que su propia lista le muestra—, pero queda
      // señalado como hallazgo aparte: es permisividad heredada, no una decisión.
      if (esEncargadoFlujo) query = scopeEncargado(query);
      break;

    case 'DIRECTOR':
      // La Dirección General ve TODOS los oficios, para supervisión general.
      if (user.unidad_tipo === 'DIRECCION_GENERAL') break;
      // Titular de un área que no es su encargado: ve lo dirigido a él y lo que
      // su área turnó. Si falta configuración, el peor caso es ver de menos.
      query = query.where((sub) => {
        sub.where('oficios.dirigido_a_id', user.id)
           .orWhereRaw(sqlEnviadoPor(user.unidad_id ? [Number(user.unidad_id)] : []));
      });
      break;

    case 'JURIDICO':
      query = query.where((sub) => {
        sub.whereRaw(TENGO_ASIGNADO).orWhereRaw(SOLICITUD_ASIGNADA_A_MI);
      });
      break;

    case 'SECRETARIA':
      // Secretaría ve todos los oficios del sistema.
      break;

    default: {
      // Cualquier otro rol solo entra si tiene asignaciones como jurídico.
      const tieneAsignaciones = await db('asignaciones_juridicas')
        .where({ abogado_id: user.id })
        .first();
      if (!tieneAsignaciones) return false;
      query = query.where((sub) => {
        sub.whereRaw(TENGO_ASIGNADO).orWhereRaw(SOLICITUD_ASIGNADA_A_MI);
      });
      break;
    }
  }

  const fila = await query.select('oficios.id').first();
  return Boolean(fila);
}
