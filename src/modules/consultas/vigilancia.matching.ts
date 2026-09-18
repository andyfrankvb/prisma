/**
 * Matching: Catálogo de Vigilancia sobre Consulta Pública
 * File: src/modules/consultas/vigilancia.matching.ts
 *
 * Tras registrar una nueva búsqueda (`crearConsulta`), evalúa si el texto
 * buscado coincide con algún `SujetoVigilado` activo y, de ser así, guarda la
 * `AlertaConsulta` correspondiente y dispara el aviso in-app.
 *
 * Se llama de forma NO bloqueante desde el controller — un error aquí nunca
 * debe tumbar el registro de la consulta (ver `evaluarYRegistrarAlertas`,
 * que atrapa sus propios errores y solo los registra en el logger).
 */

import { db }     from '../../db';
import { logger } from '../../utils/logger';
import { Consulta, SujetoVigilado } from './consultas.types';

/** Mayúsculas, sin acentos, espacios colapsados — misma normalización para el catálogo y para cada búsqueda. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Junta todo el texto "buscable" de una consulta: el nombre de quien busca + cada valor de texto dentro de `busqueda` (titular, folio, RFC...). */
function textoBuscableDe(consulta: Pick<Consulta, 'nombre_completo' | 'busqueda'>): string {
  const valoresBusqueda = Object.values(consulta.busqueda ?? {})
    .filter((v): v is string => typeof v === 'string');
  return normalizarTexto([consulta.nombre_completo, ...valoresBusqueda].join(' '));
}

/**
 * Evalúa una consulta recién creada contra el catálogo de vigilancia activo.
 * Por cada sujeto cuyo nombre normalizado aparece dentro del texto buscado,
 * registra una `AlertaConsulta` y notifica — nunca lanza: los errores se
 * registran y se descartan, para que esto sea verdaderamente no bloqueante.
 */
export async function evaluarYRegistrarAlertas(consulta: Consulta): Promise<void> {
  try {
    const sujetosActivos: SujetoVigilado[] = await db('sujeto_vigilado').where('activo', true);
    if (sujetosActivos.length === 0) return;

    const texto = textoBuscableDe(consulta);
    if (!texto) return;

    const coincidencias = sujetosActivos.filter((s) => texto.includes(s.nombre_normalizado));
    if (coincidencias.length === 0) return;

    for (const sujeto of coincidencias) {
      const [alerta] = await db('alerta_consulta')
        .insert({
          consulta_id:            consulta.id,
          sujeto_vigilado_id:     sujeto.id,
          coincidencia_detectada: sujeto.nombre_razon_social,
        })
        .returning('*');

      logger.info(
        { consulta_id: consulta.id, sujeto_vigilado_id: sujeto.id, alerta_id: alerta.id },
        'Alerta de vigilancia detectada en Consulta Pública',
      );

      // Import perezoso para evitar un ciclo de módulos con notification.dispatcher.
      const { notifyAlertaVigilancia } = await import('../../notifications/notification.dispatcher');
      await notifyAlertaVigilancia({
        alerta_id:   alerta.id,
        sujeto:      sujeto.nombre_razon_social,
        consulta_id: consulta.id,
      }).catch((err) => logger.error({ err, alerta_id: alerta.id }, 'notifyAlertaVigilancia falló'));
    }
  } catch (err) {
    logger.error({ err, consulta_id: consulta.id }, 'evaluarYRegistrarAlertas falló');
  }
}
