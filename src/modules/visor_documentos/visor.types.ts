/**
 * Types: Visor de Documentos
 * File: src/modules/visor_documentos/visor.types.ts
 *
 * Modelo rescatado del prototipo VISAR (tomo→foja→imagen, con varias
 * versiones de digitalización por foja) — ver el análisis en la conversación
 * de migración SID/VISAR → PRISMA. `version`/`origen` son varchar+CHECK en
 * BD (no ENUM nativo), mismo estilo que tickets.dto.ts.
 */

/**
 * Las campañas del prototipo VISAR. Se conservan porque la restricción de la
 * tabla todavía las admite, pero ya NO son la lista de versiones válidas: ésa
 * vive en `visor_campanias` y se consulta con `campanias.service.ts`.
 */
export const VERSIONES_DIGITALIZACION = ['V2009', 'V2022_FALTANTE', 'V3_VALIDADA'] as const;

/**
 * Clave de la campaña de digitalización de la que viene un documento
 * ('V_SID', 'V_PEMR2025', …). Es la clave del catálogo `visor_campanias`, no un
 * conjunto cerrado: agregar una campaña es un renglón en la base.
 */
export type VersionDigitalizacion = string;

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
  /** Lo que reportó quien digitalizó este archivo. Nulo en la primera digitalización, que no trajo control de calidad. */
  estatus:       string | null;
  observaciones: string | null;
  /** Del catálogo de campañas; nulo si la versión no está registrada. */
  campania_nombre: string | null;
  campania_anio:   number | null;
}

/** Cuántos documentos aportó cada campaña a un tomo. */
export interface VisorCampaniaDelTomo {
  clave:      string;
  nombre:     string;
  anio:       number | null;
  orden:      number;
  estado:     'cargada' | 'pendiente';
  documentos: number;
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
  /** Número de arranque. Es lo que ordena y lo que compara la búsqueda por rango. */
  numero_inscripcion: number;
  /**
   * El nombre literal del acervo: "0078", pero también "0001_1857" cuando un
   * PDF cubre un rango, o "0513_0513_jpg" cuando conviven variantes de formato
   * de la misma inscripción. Es lo que hay que mostrar: `numero_inscripcion`
   * solo trae el arranque, y con él tres variantes distintas se verían iguales.
   */
  numero_inscripcion_texto: string;
  /** Cierre del rango, nulo cuando el PDF cubre una sola inscripción. */
  numero_final:       number | null;
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
  /** De qué digitalizaciones tiene documentos este tomo. */
  campanias:            VisorCampaniaDelTomo[];
}

/** Un renglón de la tabla "Inscripciones Disponibles", con el tomo ya resuelto (para no pedirlo aparte). */
/** Una digitalización concreta de una inscripción, con lo que reportó quien la hizo. */
export interface VisorDigitalizacionDeInscripcion {
  clave:         string;
  nombre:        string;
  anio:          number | null;
  orden:         number;
  estatus:       string | null;
  observaciones: string | null;
}

export interface VisorInscripcionConTomo extends VisorInscripcion {
  numero_romano:  string;
  seccion_numero: number;
  /** De qué campañas hay documento, con sus observaciones. */
  digitalizaciones: VisorDigitalizacionDeInscripcion[];
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
