/**
 * Asistentes de la Directora General.
 * File: src/frontend/utils/asistentesDG.ts
 *
 * Fabian Montiel y Tania Huerta actúan como la Directora General en el módulo
 * de eventos: tienen sus mismos permisos y roles (crear/cerrar eventos, aprobar
 * y devolver en revisión final, etc.). Deben estar en la unidad DIRECCION_GENERAL.
 *
 * La lista debe coincidir con la del backend (eventos.controller.ts).
 */

const ASISTENTES_DG_EMAILS = [
  'fabianmontiel',
  'taniahuerta',
];

/** true si el usuario es un asistente designado de la DG (en la unidad DG). */
export function esAsistenteDG(user: any): boolean {
  return user?.unidad_tipo === 'DIRECCION_GENERAL'
    && ASISTENTES_DG_EMAILS.includes(String(user?.email ?? '').toLowerCase());
}

/** true si el usuario ES la Dirección General: la DG real (DIRECTOR en DG) o un asistente. */
export function esDireccionGeneral(user: any): boolean {
  return (user?.unidad_tipo === 'DIRECCION_GENERAL' && user?.rol === 'DIRECTOR')
    || esAsistenteDG(user);
}
