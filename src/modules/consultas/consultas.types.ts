/**
 * Types: Consulta Pública SIQROO
 * File: src/modules/consultas/consultas.types.ts
 *
 * Los DTOs de la API de consulta (Consulta, filtros, payloads) viven en
 * ./dtos/consulta.dto.ts — este archivo los reexporta para no romper a los
 * consumidores existentes (vigilancia.controller.ts, vigilancia.matching.ts)
 * y conserva aquí los tipos propios del Catálogo de Vigilancia.
 */

export * from './dtos/consulta.dto';
import type { ConsultasMeta } from './dtos/consulta.dto';

// ── Catálogo de Vigilancia y Alertas ─────────────────────────────
//
// Nombres de campo en snake_case, igual que el resto de PRISMA (DB y DTOs
// espejados 1 a 1) — no camelCase, para no introducir una segunda convención
// en un módulo que ya usa snake_case en todo lo demás (Consulta, filtros, etc.).

export type TipoSujetoVigilado = 'PERSONA' | 'EMPRESA';

/** Una entrada del catálogo de vigilancia — tal como vive en `sujeto_vigilado`. */
export interface SujetoVigilado {
  id:                   number;
  nombre_razon_social:  string;
  /** Precalculado (mayúsculas, sin acentos) — así se compara contra cada nueva búsqueda. */
  nombre_normalizado:   string;
  tipo:                 TipoSujetoVigilado;
  activo:               boolean;
  creado_por:           number;
  fecha_creacion:       string;
}

export interface CrearSujetoVigiladoPayload {
  nombre_razon_social: string;
  tipo:                TipoSujetoVigilado;
}

export interface EditarSujetoVigiladoPayload {
  nombre_razon_social?: string;
  tipo?:                TipoSujetoVigilado;
}

export interface FiltrosSujetoVigilado {
  activo?: boolean;
  tipo?:   TipoSujetoVigilado;
  search?: string;
}

/** Una coincidencia detectada — tal como vive en `alerta_consulta`. */
export interface AlertaConsulta {
  id:                     number;
  consulta_id:            number;
  sujeto_vigilado_id:     number;
  coincidencia_detectada: string;
  fecha_alerta:           string;
  leido:                  boolean;
}

/** Una alerta con los datos ya resueltos para mostrar en el panel — sin que el frontend tenga que cruzar tablas. */
export interface AlertaConsultaConDetalle extends AlertaConsulta {
  sujeto_nombre_razon_social: string;
  sujeto_tipo:                TipoSujetoVigilado;
  consulta_nombre_completo:   string;
  consulta_codigo_acceso:     string;
  consulta_hora_busqueda:     string;
}

export interface FiltrosAlertaConsulta {
  desde?:              string;
  hasta?:              string;
  sujeto_vigilado_id?: number;
  leido?:              boolean;
  page?:               number;
  per_page?:           number;
}

export interface AlertasConsultaResponse {
  data: AlertaConsultaConDetalle[];
  meta: ConsultasMeta;
}
