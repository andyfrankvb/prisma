/**
 * Types: Seguimiento de Trámites
 * File: src/modules/tramites/tramites.types.ts
 */

export type EstatusTramite =
  | 'NUEVO'
  | 'EN_REVISION'
  | 'EN_PROCESO'
  | 'FINALIZADO'
  | 'RECHAZADO'
  | 'DEVUELTO_DELEGADO'
  | 'DEVUELTO_JURIDICO';

export const TIPOS_TRAMITE = [
  'Convenio',
  'Contrato',
  'Consulta Jurídica',
  'Acuerdo',
  'Resolución',
  'Otro',
] as const;

export type TipoTramite = typeof TIPOS_TRAMITE[number];

// Transiciones válidas de estado
const TRANSICIONES_VALIDAS: Record<EstatusTramite, EstatusTramite[]> = {
  NUEVO:              ['EN_REVISION'],
  EN_REVISION:        ['EN_PROCESO', 'RECHAZADO', 'DEVUELTO_DELEGADO'],
  DEVUELTO_DELEGADO:  ['NUEVO'],
  EN_PROCESO:         ['FINALIZADO', 'DEVUELTO_JURIDICO'],
  DEVUELTO_JURIDICO:  ['EN_PROCESO'],
  FINALIZADO:         [],
  RECHAZADO:          [],
};

export function isValidTramiteTransition(
  actual: EstatusTramite,
  nuevo: EstatusTramite,
): boolean {
  return TRANSICIONES_VALIDAS[actual]?.includes(nuevo) ?? false;
}

// Request bodies
export interface CrearTramiteBody {
  descripcion:              string;
  numero_ticket:            string;
  nombre_solicitante:       string;
  correo_solicitante:       string;
  telefono_solicitante:     string;
  checklist_documentacion:  boolean;
  checklist_proyecto:       boolean;
}

export interface AprobarTramiteBody {
  fecha_compromiso: string; // YYYY-MM-DD
  comentario:       string;
}

export interface RechazarTramiteBody {
  comentario: string;
}

export interface FinalizarTramiteBody {
  comentario: string;
}

export interface AgregarComentarioBody {
  contenido: string;
}

// Entidad principal
export interface Tramite {
  id:                       number;
  folio:                    string;
  numero_ticket:            string;
  descripcion:              string;
  estatus:                  EstatusTramite;
  unidad_creadora_id:       number;
  creador_id:               number;
  nombre_solicitante:       string;
  correo_solicitante:       string;
  telefono_solicitante:     string;
  checklist_documentacion:  boolean;
  checklist_proyecto:       boolean;
  comentarios?:             string | null;
  fecha_compromiso?:        string | null;
  fecha_registro:           Date | string;
  fecha_cierre:             Date | string | null;
  creado_en:                Date | string;
  actualizado_en:           Date | string;
}
