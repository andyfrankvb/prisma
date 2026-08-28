/**
 * Aviso de solicitudes a otras áreas que se quedaron paradas.
 *
 * Las solicitudes no llevan plazo —salvo los testamentos, que tienen el suyo—,
 * así que nada avisa por sí solo de que una lleva semanas sin moverse. Y sí
 * estorban: mientras una siga abierta, el oficio de quien la pidió no puede
 * recibir visto bueno ni firma. Antes esto casi no se notaba porque solo la
 * Dirección General podía solicitar; al abrirlo a todas las áreas, cualquiera
 * puede dejar trabada a otra sin darse cuenta.
 *
 * Se avisa en dos momentos, y cada uno le habla a quien puede destrabarlo:
 *   · a los 3 días hábiles sin que la asignen — el área ni siquiera la ha
 *     tomado, así que el aviso va a su encargado.
 *   · a los 5 días hábiles sin contestar — ya la asignaron y no la responden;
 *     va al encargado, a quien la trabaja, y también a quien la pidió, para que
 *     sepa por qué su oficio no avanza.
 *
 * Cada aviso se manda una sola vez. Sin esa marca, el mismo recordatorio
 * llegaría todas las noches hasta que alguien contestara, y a la tercera nadie
 * los volvería a leer.
 */

import { db } from '../db';
import { logger } from '../utils/logger';
import { notifyDelegatorio } from './notification.dispatcher';

const ZONA = process.env.TZ ?? 'America/Cancun';

/** Días hábiles desde que se creó la solicitud hasta hoy, contados por la base. */
const DIAS_PARADA = `(
  SELECT count(*)::int
    FROM generate_series((d.creado_en AT TIME ZONE '${ZONA}')::date + 1,
                         (now()       AT TIME ZONE '${ZONA}')::date,
                         interval '1 day') AS g
   WHERE extract(isodow FROM g) < 6)`;

/** A partir de cuántos días hábiles se considera parada cada etapa. */
const DIAS_SIN_ASIGNAR   = 3;
const DIAS_SIN_RESPONDER = 5;

interface SolicitudDemorada {
  id:                 number;
  oficio_id:          number;
  folio:              string;
  dependencia_origen: string | null;
  area:               string | null;
  descripcion:        string;
  asignado_a_id:      number | null;
  solicitado_por_id:  number;
  unidad_destino_id:  number;
  dias:               number;
}

/**
 * Las que llevan demasiado tiempo en una etapa y todavía no han sido avisadas.
 * `columnaAviso` es la marca que evita repetir: si ya tiene fecha, se salta.
 */
async function buscarDemoradas(
  estados: string[], dias: number, columnaAviso: string,
): Promise<SolicitudDemorada[]> {
  return db('oficio_delegatorios as d')
    .join('oficios as o', 'o.id', 'd.oficio_id')
    .leftJoin('catalogo_unidades as cu', 'cu.id', 'd.unidad_destino_id')
    .whereIn('d.estado', estados)
    .whereNull(`d.${columnaAviso}`)
    .andWhereRaw(`${DIAS_PARADA} >= ?`, [dias])
    .select(
      'd.id', 'd.oficio_id', 'd.descripcion', 'd.asignado_a_id',
      'd.solicitado_por_id', 'd.unidad_destino_id',
      'o.folio', 'o.dependencia_origen',
      'cu.nombre as area',
      db.raw(`${DIAS_PARADA} AS dias`),
    );
}

/** Los encargados configurados de un área: quienes responden por ella. */
async function encargadosDe(unidadId: number): Promise<number[]> {
  return db('configuracion_flujos')
    .where({ modulo_clave: 'oficialia_partes', rol_flujo: 'ENCARGADO', unidad_id: unidadId })
    .whereNotNull('usuario_id')
    .pluck('usuario_id');
}

export async function revisarSolicitudesDemoradas(): Promise<void> {
  try {
    const [sinAsignar, sinResponder] = await Promise.all([
      buscarDemoradas(['PENDIENTE'], DIAS_SIN_ASIGNAR, 'aviso_sin_asignar_en'),
      buscarDemoradas(['ASIGNADO', 'EN_REVISION'], DIAS_SIN_RESPONDER, 'aviso_sin_responder_en'),
    ]);

    logger.info(
      { sin_asignar: sinAsignar.length, sin_responder: sinResponder.length },
      'Solicitudes a otras áreas demoradas',
    );

    for (const s of sinAsignar) {
      const destinatarios = await encargadosDe(s.unidad_destino_id);
      await avisar(s, destinatarios,
        `Lleva ${s.dias} días hábiles sin que nadie la tome: ${s.descripcion}`,
        'aviso_sin_asignar_en');
    }

    for (const s of sinResponder) {
      // También a quien la pidió: es el que tiene el oficio detenido y no tiene
      // por qué enterarse hasta que alguien se acuerde de decírselo.
      const destinatarios = new Set<number>(await encargadosDe(s.unidad_destino_id));
      if (s.asignado_a_id) destinatarios.add(s.asignado_a_id);
      destinatarios.add(s.solicitado_por_id);
      await avisar(s, [...destinatarios],
        `Lleva ${s.dias} días hábiles sin contestarse: ${s.descripcion}`,
        'aviso_sin_responder_en');
    }
  } catch (err) {
    logger.error({ err }, 'Falló la revisión de solicitudes demoradas');
  }
}

/**
 * Manda el aviso y deja la marca. Si el envío falla se marca de todos modos: es
 * un recordatorio, y volver a intentarlo cada noche molestaría más de lo que
 * ayudaría. El siguiente umbral —o la pantalla, donde el contador siempre está a
 * la vista— vuelve a sacar el caso a flote.
 */
async function avisar(
  s: SolicitudDemorada, usuarioIds: number[], nota: string, columnaAviso: string,
): Promise<void> {
  try {
    await notifyDelegatorio({
      event:              'DELEGATORIO_DEMORADO',
      usuarioIds,
      oficio_id:          s.oficio_id,
      folio:              s.folio,
      dependencia_origen: s.dependencia_origen ?? undefined,
      area:               s.area ?? undefined,
      nota,
    });
  } catch (err) {
    logger.error({ err, delegatorio_id: s.id }, 'Aviso de solicitud demorada falló');
  }
  await db('oficio_delegatorios').where({ id: s.id }).update({ [columnaAviso]: new Date() });
}
