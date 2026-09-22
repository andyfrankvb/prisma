/**
 * Types: Folio de salida (Oficialía de Partes)
 * File: src/modules/oficialia_partes/folios_salida/folio-salida.types.ts
 *
 * Consecutivo del oficio de RESPUESTA (Analista Jurídico / Director Jurídico).
 * No confundir con `oficios.folio`, que es el número de control de ENTRADA
 * (ver oficios.controller.ts::crearOficio) y no tiene relación con este módulo.
 */

export type EstatusFolioSalida = 'RESERVADO' | 'ASIGNADO' | 'CANCELADO';

/**
 * Plantillas vigentes de formato. 'LEGACY' es exclusivo de los folios
 * migrados de SID cuyo rol de origen no se reconstruye con certeza
 * (ver db/migrate-folios-sid.mjs) — nunca se asigna a un folio nuevo.
 */
export type RolFormatoFolio = 'JURIDICO' | 'DIRECTOR_JURIDICO' | 'LEGACY';

export interface FolioSalidaDTO {
  id:                 number;
  oficio_id:          number | null;
  consecutivo:        number;
  folio_formateado:   string;
  rol_formato:        RolFormatoFolio;
  anio:               number;
  mes_romano:         string;
  estatus:            EstatusFolioSalida;
  reservado_por_id:   number | null;
  reservado_por_nombre?: string | null;
  reservado_en:       string | null;
  asignado_por_id:    number | null;
  asignado_por_nombre?: string | null;
  asignado_en:        string | null;
  cancelado_por_id:   number | null;
  cancelado_en:       string | null;
  motivo_cancelacion: string | null;
  es_legacy:          boolean;
  origen_sid_tabla:   string | null;
  origen_sid_id:      number | null;
  creado_en:          string;
}

export interface ReservarFolioSalidaRequest {
  oficio_id:   number;
  rol_formato: Extract<RolFormatoFolio, 'JURIDICO' | 'DIRECTOR_JURIDICO'>;
}

export interface CancelarFolioSalidaRequest {
  motivo: string;
}

export type EventoHistorialFolio = 'RESERVADO' | 'ASIGNADO' | 'CANCELADO' | 'MIGRADO_SID';

export interface FolioSalidaHistorialDTO {
  id:               number;
  folio_salida_id:  number;
  oficio_id:        number | null;
  fecha_evento:     string;
  evento:           EventoHistorialFolio;
  usuario_id:       number | null;
  usuario_nombre?:  string | null;
  rol_usuario:      string | null;
  estado_oficio:    string | null;
  version_proyecto: number | null;
  hash_documento:   string | null;
}

/** Lo que puede hacer el usuario autenticado con el folio de un oficio concreto. */
export interface PermisosFolioSalida {
  puede_reservar:   boolean;
  puede_formalizar: boolean;
  puede_cancelar:   boolean;
}
