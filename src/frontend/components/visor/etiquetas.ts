/**
 * Etiquetas de inscripción para pantalla.
 * File: src/frontend/components/visor/etiquetas.ts
 *
 * El acervo del SID no nombra sus inscripciones con un entero. Hay rangos
 * ("0001_1857", cuando un solo PDF cubre varias inscripciones) y variantes de
 * formato de la misma inscripción que conviven como archivos distintos
 * ("0513_0513_", "0513_0513_G4", "0513_0513_jpg"). Rellenar
 * `numero_inscripcion` a cuatro dígitos —como se hacía con los datos del
 * prototipo, donde siempre era un entero— mostraría esas tres como "0513" y el
 * usuario no podría distinguirlas.
 */
import type { VisorInscripcion } from '../../types';

/**
 * Lo que se muestra de una inscripción: el nombre literal del acervo, sin la
 * basura de captura que algunos traen pegada al final (guiones bajos o puntos
 * sueltos). Si no hay texto —las 434 del prototipo—, el número rellenado.
 *
 * Solo se recorta lo que no distingue: "0086_0017___________" queda
 * "0086_0017", pero "0513_0513_jpg" se conserva íntegro, porque es justo lo
 * que lo separa de "0513_0513_".
 */
export function etiquetaInscripcion(
  insc: Pick<VisorInscripcion, 'numero_inscripcion'> & { numero_inscripcion_texto?: string | null },
): string {
  const texto = insc.numero_inscripcion_texto?.replace(/[._]+$/, '').trim();
  return texto ? texto : String(insc.numero_inscripcion).padStart(4, '0');
}
