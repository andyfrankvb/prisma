/**
 * Types: Oficialía de Partes
 * File: src/modules/oficialia_partes/oficios.types.ts
 */

export type RolUsuario =
  | 'OFICIAL'
  | 'ENCARGADO'
  | 'JURIDICO'
  | 'SECRETARIA'
  | 'DIRECTOR'
  | 'OPERATIVO'
  | 'SUPERADMIN'
  | 'PARTICULAR';

export type EstatusOficio =
  | 'RECIBIDO'
  | 'ASIGNADO'
  | 'EN_REVISION'
  | 'EN_RECONSIDERACION'
  | 'VOBO_APROBADO'
  | 'FINALIZADO';

/** Shape of the authenticated user attached by auth middleware */
export interface AuthUser {
  id:          number;
  nombre:      string;
  email:       string;
  rol:         RolUsuario;
  oficina_id:  number;
  unidad_id:   number;
  unidad_tipo: 'DIRECCION_GENERAL' | 'DIRECCION' | 'DELEGACION';
}

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Estatus en los que la asignación a un analista sigue vigente.
 *
 * Turnar un oficio a otra área no borra el renglón de `asignaciones_juridicas`:
 * el oficio regresa a RECIBIDO con otro destinatario y la asignación anterior
 * queda ahí. Sin este filtro, el analista del área que ya lo soltó conservaría
 * sus facultades sobre un expediente que vive en otra parte.
 */
export const ASIGNACION_VIGENTE: readonly EstatusOficio[] = [
  'ASIGNADO', 'EN_REVISION', 'EN_RECONSIDERACION', 'VOBO_APROBADO',
] as const;
