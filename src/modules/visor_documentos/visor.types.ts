/**
 * Types: Visor de Documentos
 * File: src/modules/visor_documentos/visor.types.ts
 *
 * Modelo rescatado del prototipo VISAR (tomo→foja→imagen, con varias
 * versiones de digitalización por foja) — ver el análisis en la conversación
 * de migración SID/VISAR → PRISMA. `version`/`origen` son varchar+CHECK en
 * BD (no ENUM nativo), mismo estilo que tickets.dto.ts.
 */

export const VERSIONES_DIGITALIZACION = ['V2009', 'V2022_FALTANTE', 'V3_VALIDADA'] as const;
export type VersionDigitalizacion = (typeof VERSIONES_DIGITALIZACION)[number];

export const ORIGENES_TRANSCRIPCION = ['IA', 'HUMANO'] as const;
export type OrigenTranscripcion = (typeof ORIGENES_TRANSCRIPCION)[number];

export interface VisorDelegacion {
  id:     number;
  nombre: string;
  activo: boolean;
}

export interface VisorSeccion {
  id:     number;
  numero: number;
  nombre: string;
}

export interface VisorTomo {
  id:                  number;
  origen_id:           number | null;
  delegacion_id:       number;
  seccion_id:          number;
  numero_romano:       string;
  indice_orden:        number;
  anio_registro:       number;
  cajon:               string | null;
  id_libro:            number | null;
  inscripcion_inicial: number | null;
  inscripcion_final:   number | null;
}

export interface VisorFoja {
  id:               number;
  origen_id:        number | null;
  tomo_id:          number;
  numero_foja:      string;
  inscripcion:      string | null;
  orden_secuencial: number;
}

export interface VisorImagenFoja {
  id:            number;
  foja_id:       number;
  version:       VersionDigitalizacion;
  ruta_storage:  string;
  formato:       string;
  subido_por_id: number | null;
  created_at:    string;
}

export interface VisorDictamenVersion {
  id:                     number;
  foja_id:                number;
  version_seleccionada:   VersionDigitalizacion;
  justificacion_juridica: string;
  usuario_id:             number;
  fecha_dictamen:         string;
}

export interface VisorTranscripcion {
  id:                  number;
  foja_id:             number;
  texto_transcrito:    string;
  origen:              OrigenTranscripcion;
  modelo_ia:           string | null;
  creado_por:          number;
  ultimo_editor_id:    number | null;
  fecha_actualizacion: string;
}

export interface VisorInscripcion {
  id:                 number;
  tomo_id:            number;
  foja_id:            number | null;
  numero_inscripcion: number;
  volumen:            string | null;
  asignacion:         string;
  estatus:            string | null;
  observaciones:      string | null;
}

/** Un renglón de la tabla "Libros Disponibles" (equivalente a la de SID), con fojas/inscripciones ya contadas. */
export interface VisorLibroResumen {
  id:                   number;
  seccion_numero:       number;
  seccion_nombre:       string;
  numero_romano:        string;
  cajon:                string | null;
  id_libro:             number | null;
  total_fojas:          number;
  foja_inicial:         string | null;
  foja_final:           string | null;
  total_inscripciones:  number;
}

/** Un renglón de la tabla "Inscripciones Disponibles", con el tomo ya resuelto (para no pedirlo aparte). */
export interface VisorInscripcionConTomo extends VisorInscripcion {
  numero_romano:  string;
  seccion_numero: number;
}

export interface CrearDictamenPayload {
  version_seleccionada:   VersionDigitalizacion;
  justificacion_juridica: string;
}

export interface ActualizarTranscripcionPayload {
  texto_transcrito: string;
}

export interface MergeRangoPayload {
  desde: number;
  hasta: number;
}

export interface ImagenProcesadaResult {
  buffer:          Buffer;
  version_servida: VersionDigitalizacion;
  content_type:    'application/pdf';
}
