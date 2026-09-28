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
 * Palabras de un texto, sin signos ni números.
 *
 * Se ignoran las de menos de 3 letras ("DE", "LA", "S", "A", "C", "V") y los
 * números: en las búsquedas por titular, SID mete el código de tipo de persona
 * ("61") entre el nombre y los apellidos, y en las razones sociales cada quien
 * escribe "S.A. DE C.V." a su manera. Exigir esas partículas haría que el
 * catálogo fallara por diferencias de puntuación, no de identidad.
 */
function palabrasDe(texto: string): string[] {
  return normalizarTexto(texto)
    .replace(/[^A-ZÑ0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !/^\d+$/.test(p));
}

/**
 * ¿La búsqueda apunta a este sujeto vigilado?
 *
 * Coincide si TODAS las palabras del nombre vigilado aparecen en la búsqueda,
 * sin importar el orden ni lo que haya entre ellas. La comparación literal no
 * alcanza: SID guarda el titular partido en campos (`nombre`, `apellidoMaterno`,
 * `apellidoPaterno`) y los entrega en ese orden, así que una búsqueda de
 * "ANGEL HERNANDEZ GONZALEZ" llega como "ANGEL 61 GONZALEZ HERNANDEZ" —
 * apellidos invertidos y un número en medio. Buscar la cadena seguida solo
 * funcionaba con empresas, que sí viajan en un único campo.
 *
 * Se prefiere pecar de más: en vigilancia, una alerta de sobra se descarta de
 * un vistazo; una que no llegó no se nota nunca.
 */
export function coincideConSujeto(textoBusqueda: string, nombreVigilado: string): boolean {
  const textoNormalizado = normalizarTexto(textoBusqueda);
  const nombreNormalizado = normalizarTexto(nombreVigilado);
  if (!textoNormalizado || !nombreNormalizado) return false;

  // Caso directo: el nombre aparece tal cual (razones sociales, apodos).
  if (textoNormalizado.includes(nombreNormalizado)) return true;

  const buscadas = palabrasDe(nombreVigilado);
  if (buscadas.length === 0) return false;

  const presentes = new Set(palabrasDe(textoBusqueda));
  return buscadas.every((p) => presentes.has(p));
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

    const coincidencias = sujetosActivos.filter((s) => coincideConSujeto(texto, s.nombre_razon_social));
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
