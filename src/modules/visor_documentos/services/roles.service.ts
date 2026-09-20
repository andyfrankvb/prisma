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
import type { AuthUser } from '../../oficialia_partes/oficios.types';

/** SUPERADMIN o DIRECTOR: sin marca de agua, con derechos de edición. */
export function esAdminEquivalente(user: AuthUser): boolean {
  return user.rol === 'SUPERADMIN' || user.rol === 'DIRECTOR';
}

/** Quién puede emitir/editar el dictamen jurídico de versión. */
export function puedeCurar(user: AuthUser): boolean {
  return esAdminEquivalente(user) || user.rol === 'JURIDICO' || user.rol === 'ENCARGADO';
}
