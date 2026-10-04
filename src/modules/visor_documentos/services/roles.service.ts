/**
 * Service: Roles del Visor de Documentos
 * File: src/modules/visor_documentos/services/roles.service.ts
 *
 * Mismo patrón que el resto de PRISMA: predicados inline por handler, no
 * middleware de rol (ver esGestorDeTickets en tickets/services/ticket-api.service.ts).
 *
 * Mapeo desde los roles ADMIN/LECTURA/DESCARGA de VISAR a los roles reales
 * de PRISMA:
 *   - "admin-equivalente" (VISAR: ADMIN) → SUPERADMIN o DIRECTOR: ve la
 *     imagen sin marca de agua y puede curar/editar.
 *   - "puede curar" → admin-equivalente + JURIDICO/ENCARGADO: son quienes
 *     emiten el dictamen jurídico de qué versión de digitalización es válida.
 *   - Cualquier otro rol con el módulo habilitado (usuario_modulos) puede
 *     ver, pero con marca de agua — igual que VISAR trataba a LECTURA/DESCARGA.
 */
import { db } from '../../../db';
import type { AuthUser } from '../../oficialia_partes/oficios.types';

/** SUPERADMIN o DIRECTOR: sin marca de agua, con derechos de edición. */
export function esAdminEquivalente(user: AuthUser): boolean {
  return user.rol === 'SUPERADMIN' || user.rol === 'DIRECTOR';
}

/** Quién puede emitir/editar el dictamen jurídico de versión. */
export function puedeCurar(user: AuthUser): boolean {
  return esAdminEquivalente(user) || user.rol === 'JURIDICO' || user.rol === 'ENCARGADO';
}

/**
 * Si esta persona puede ver las observaciones del proveedor.
 *
 * Son lo que reportó quien digitalizó cada documento —"fondo negro", "faltó
 * actualizar las anotaciones marginales de la foja 2", "el registro no está en
 * archivo digital"— e indican dónde el acervo digital no refleja el libro
 * físico. Es información confidencial y se concede por persona, al asignarle el
 * módulo (`usuario_modulos.ver_observaciones`).
 *
 * Los admin-equivalentes la ven siempre: son quienes configuran el módulo y
 * quienes responden por el acervo.
 *
 * El filtrado ocurre en el servidor y no en la pantalla: lo que no se debe ver,
 * no se envía.
 */
export async function puedeVerObservaciones(user: AuthUser): Promise<boolean> {
  if (esAdminEquivalente(user)) return true;

  const fila = await db('usuario_modulos as um')
    .join('modulos as m', 'm.id', 'um.modulo_id')
    .where({ 'um.usuario_id': user.id, 'm.clave': 'visor_documentos' })
    .first('um.ver_observaciones');

  return Boolean(fila?.ver_observaciones);
}
